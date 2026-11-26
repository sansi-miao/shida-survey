import csv
import hmac
import io
import os
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .demo import seed_demo
from .schemas import (
    DraftInput,
    PublishInput,
    SubmissionInput,
    SurveyContent,
    check_publication,
    checked_answers,
)
from .store import ROOT, Base, Submission, Survey, Version, connect, timestamp


def survey_info(survey: Survey, *, published_revision: int = 0) -> dict:
    return {
        "id": survey.id,
        "draft": survey.draft,
        "revision": survey.revision,
        "published_version": survey.published_version,
        "published_revision": published_revision,
        "updated_at": survey.updated_at,
    }


def csv_cell(value: str) -> str:
    return "'" + value if value.lstrip()[:1] in {"=", "+", "-", "@"} else value


def create_app(
    database_url: str | None = None,
    admin_token: str = "",
    local_dev: bool = False,
    demo: bool = False,
) -> FastAPI:
    if admin_token and not admin_token.isascii():
        raise ValueError("SURVEY_ADMIN_TOKEN must contain only ASCII characters")

    engine, sessions = connect(database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        Base.metadata.create_all(engine)
        if demo:
            with sessions() as session:
                seed_demo(session)
        yield
        engine.dispose()

    app = FastAPI(title="拾答 · 问卷 API", lifespan=lifespan)

    def database():
        with sessions() as session:
            yield session

    def require_admin(authorization: Annotated[str, Header()] = ""):
        if admin_token:
            if hmac.compare_digest(authorization.encode(), ("Bearer " + admin_token).encode()):
                return
        elif local_dev:
            return
        raise HTTPException(401, "请输入有效的后台访问口令")

    admin = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])
    public = APIRouter(prefix="/api/public")

    def find_survey(session: Session, survey_id: str) -> Survey:
        survey = session.get(Survey, survey_id)
        if survey is None:
            raise HTTPException(404, "找不到这份问卷")
        return survey

    def find_version(session: Session, survey_id: str, version: int) -> Version:
        snapshot = session.get(Version, (survey_id, version))
        if snapshot is None:
            raise HTTPException(404, "这份问卷尚未发布，或版本不存在")
        return snapshot

    def read_detail(session: Session, survey: Survey) -> dict:
        snapshot = session.get(Version, (survey.id, survey.published_version))
        return survey_info(survey, published_revision=snapshot.draft_revision if snapshot else 0)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @admin.get("/surveys")
    def list_surveys(session: Session = Depends(database)):
        totals = (
            select(Submission.survey_id, func.count().label("total"))
            .group_by(Submission.survey_id)
            .subquery()
        )
        rows = session.execute(
            select(Survey, func.coalesce(totals.c.total, 0))
            .outerjoin(totals, Survey.id == totals.c.survey_id)
            .order_by(Survey.updated_at.desc(), Survey.id)
        )
        return [
            {"id": survey.id, "title": survey.draft["title"], "published_version": survey.published_version,
             "response_count": count}
            for survey, count in rows
        ]

    @admin.post("/surveys", status_code=201)
    def create_survey(session: Session = Depends(database)):
        survey = Survey(id=uuid4().hex[:12], draft=SurveyContent(title="未命名问卷").model_dump())
        session.add(survey)
        session.commit()
        return survey_info(survey)

    @admin.get("/surveys/{survey_id}")
    def get_draft(survey_id: str, session: Session = Depends(database)):
        return read_detail(session, find_survey(session, survey_id))

    @admin.put("/surveys/{survey_id}")
    def save_draft(survey_id: str, data: DraftInput, session: Session = Depends(database)):
        survey = find_survey(session, survey_id)
        draft = data.draft.model_dump()
        if survey.revision == data.revision and survey.draft == draft:
            return read_detail(session, survey)
        changed = session.execute(
            update(Survey).where(Survey.id == survey_id, Survey.revision == data.revision)
            .values(draft=draft, revision=Survey.revision + 1, updated_at=timestamp())
        )
        if changed.rowcount != 1:
            raise HTTPException(409, "问卷已被更新。重新打开后再编辑。")
        session.commit()
        session.refresh(survey)
        return read_detail(session, survey)

    @admin.post("/surveys/{survey_id}/publish")
    def publish(survey_id: str, data: PublishInput, session: Session = Depends(database)):
        survey = find_survey(session, survey_id)
        if survey.revision != data.revision:
            raise HTTPException(409, "草稿已更新。重新打开后再发布。")
        last = session.get(Version, (survey_id, survey.published_version))
        if last and last.draft_revision == data.revision:
            return survey_info(survey, published_revision=data.revision)

        check_publication(SurveyContent.model_validate(survey.draft))
        current_version = survey.published_version
        next_version = current_version + 1
        changed = session.execute(
            update(Survey).where(
                Survey.id == survey_id, Survey.revision == data.revision,
                Survey.published_version == current_version,
            ).values(published_version=next_version, updated_at=timestamp())
        )
        if changed.rowcount != 1:
            raise HTTPException(409, "问卷已被更新或发布。请重新打开。")
        session.add(Version(
            survey_id=survey_id, number=next_version, draft_revision=data.revision,
            content=survey.draft,
        ))
        session.commit()
        session.refresh(survey)
        return survey_info(survey, published_revision=data.revision)

    @public.get("/surveys/{survey_id}")
    def public_survey(survey_id: str, session: Session = Depends(database)):
        survey = find_survey(session, survey_id)
        snapshot = find_version(session, survey_id, survey.published_version)
        return {"id": survey_id, "version": snapshot.number, **snapshot.content}

    @public.post("/surveys/{survey_id}/responses", status_code=201)
    def submit(survey_id: str, data: SubmissionInput, session: Session = Depends(database)):
        snapshot = find_version(session, survey_id, data.version)
        answers = checked_answers(SurveyContent.model_validate(snapshot.content), data.answers)
        submission_id = str(data.id)
        row = Submission(
            survey_id=survey_id, id=submission_id, version=data.version, answers=answers
        )
        session.add(row)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            existing = session.get(Submission, (survey_id, submission_id))
            if existing is None:
                raise
            if existing.version != data.version or existing.answers != answers:
                raise HTTPException(409, "这次提交已保存，请刷新后重新填写")
        return {"id": submission_id, "version": data.version}

    def report_data(session: Session, survey_id: str, version: int):
        survey = find_survey(session, survey_id)
        snapshot = find_version(session, survey_id, version or survey.published_version)
        responses = session.scalars(
            select(Submission).where(
                Submission.survey_id == survey_id, Submission.version == snapshot.number,
            ).order_by(Submission.created_at.desc(), Submission.id)
        ).all()
        return survey, snapshot, responses

    @admin.get("/surveys/{survey_id}/results")
    def results(survey_id: str, version: int = 0, session: Session = Depends(database)):
        survey, snapshot, responses = report_data(session, survey_id, version)
        questions = []
        for question in snapshot.content["questions"]:
            values = [row.answers[question["id"]] for row in responses if question["id"] in row.answers]
            if question["type"] == "text":
                result = {"samples": values[:8]}
            else:
                counts = dict.fromkeys(question["options"], 0)
                for value in values:
                    for option in value if isinstance(value, list) else [value]:
                        counts[option] += 1
                result = {"counts": counts}
            questions.append({**question, "answered": len(values), **result})
        return {
            "version": snapshot.number, "latest_version": survey.published_version,
            "title": snapshot.content["title"], "response_count": len(responses), "questions": questions,
        }

    @admin.get("/surveys/{survey_id}/results.csv")
    def download_csv(survey_id: str, version: int = 0, session: Session = Depends(database)):
        _, snapshot, responses = report_data(session, survey_id, version)
        output = io.StringIO(newline="")
        writer = csv.writer(output)
        questions = snapshot.content["questions"]
        writer.writerow(["答卷编号", "问卷版本", "提交时间 (UTC)", *(
            csv_cell(question["title"]) for question in questions
        )])
        for row in responses:
            answers = [row.answers.get(question["id"], "") for question in questions]
            writer.writerow([row.id, snapshot.number, row.created_at, *(
                csv_cell(" / ".join(value) if isinstance(value, list) else value)
                for value in answers
            )])
        return Response(
            "\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="survey-{survey_id}-v{snapshot.number}.csv"'},
        )

    app.include_router(admin)
    app.include_router(public)

    dist = ROOT / "web" / "dist"
    if (dist / "index.html").is_file():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/", include_in_schema=False)
        @app.get("/s/{survey_id}", include_in_schema=False)
        def web_page(survey_id: str = ""):
            return FileResponse(dist / "index.html")

    return app


def create_app_from_env() -> FastAPI:
    return create_app(
        database_url=os.environ.get("SURVEY_DATABASE_URL"),
        admin_token=os.environ.get("SURVEY_ADMIN_TOKEN", ""),
        local_dev=os.environ.get("SURVEY_LOCAL_DEV") == "1",
        demo=os.environ.get("SURVEY_SEED_DEMO") == "1",
    )


def create_hosted_app() -> FastAPI:
    database_url = os.environ.get("SURVEY_DATABASE_URL", "").strip()
    if not database_url.startswith(("postgresql://", "postgres://", "postgresql+psycopg://")):
        raise ValueError("Set SURVEY_DATABASE_URL to a PostgreSQL connection URL")
    admin_token = os.environ.get("SURVEY_ADMIN_TOKEN", "").strip()
    if not admin_token:
        raise ValueError("Set SURVEY_ADMIN_TOKEN to a private administrator token")
    return create_app(
        database_url=database_url,
        admin_token=admin_token,
        demo=os.environ.get("SURVEY_SEED_DEMO") == "1",
    )
