from uuid import uuid4

from sqlalchemy.orm import Session

from .store import Submission, Survey, Version


DEMO_ID = "market-feedback"


def seed_demo(session: Session) -> None:
    if session.get(Survey, DEMO_ID):
        return

    content = {
        "title": "校园市集体验反馈",
        "description": "谢谢你来逛校园市集！花一分钟告诉我们，下一场可以做得更好。",
        "questions": [
            {
                "id": "rating",
                "title": "你对这次市集的整体体验如何？",
                "type": "single",
                "required": True,
                "options": ["非常满意", "比较满意", "一般", "有待改善"],
            },
            {
                "id": "activities",
                "title": "哪些环节是你最喜欢的？",
                "type": "multiple",
                "required": True,
                "options": ["创意摊位", "手作体验", "现场演出", "志愿者服务"],
            },
            {
                "id": "suggestion",
                "title": "下次你希望我们改进什么？",
                "type": "text",
                "required": False,
                "options": [],
            },
        ],
    }
    session.add(Survey(id=DEMO_ID, draft=content, published_version=1))
    session.flush()
    session.add(Version(survey_id=DEMO_ID, number=1, draft_revision=1, content=content))
    session.flush()
    for rating, choices, suggestion in [
        ("非常满意", ["创意摊位", "手作体验"], "想看到更多手作摊位。"),
        ("非常满意", ["手作体验"], ""),
        ("比较满意", ["现场演出", "志愿者服务"], "出口附近可以增加一张场地指引图。"),
        ("非常满意", ["创意摊位", "现场演出"], ""),
        ("比较满意", ["手作体验", "志愿者服务"], ""),
        ("一般", ["创意摊位"], "高峰期最好有单独的入口和出口。"),
        ("非常满意", ["创意摊位", "手作体验"], ""),
        ("有待改善", ["现场演出"], "建议提前公布节目时间。"),
    ]:
        answers = {"rating": rating, "activities": choices}
        if suggestion:
            answers["suggestion"] = suggestion
        session.add(Submission(
            survey_id=DEMO_ID, id=str(uuid4()), version=1, answers=answers
        ))
    session.commit()
