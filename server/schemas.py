from typing import Annotated, Literal
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
QuestionId = Annotated[str, StringConstraints(pattern=r"^[a-zA-Z0-9_-]{1,40}$")]


class Payload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Question(Payload):
    id: QuestionId
    title: ShortText
    type: Literal["single", "multiple", "text"]
    required: bool = True
    options: list[ShortText] = Field(default_factory=list, max_length=8)


class SurveyContent(Payload):
    title: ShortText
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    questions: list[Question] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def unique_questions(self):
        if len({question.id for question in self.questions}) != len(self.questions):
            raise ValueError("题目标识不能重复")
        return self


class DraftInput(Payload):
    revision: int = Field(ge=1)
    draft: SurveyContent


class PublishInput(Payload):
    revision: int = Field(ge=1)


class SubmissionInput(Payload):
    id: UUID
    version: int = Field(ge=1)
    answers: dict[QuestionId, str | list[str]] = Field(max_length=12)


def check_publication(content: SurveyContent) -> None:
    if not content.title or not content.questions:
        raise HTTPException(422, "请填写问卷标题并添加至少一道题")
    for index, question in enumerate(content.questions, start=1):
        if not question.title:
            raise HTTPException(422, f"请填写第 {index} 题的题目")
        if question.type == "text":
            if question.options:
                raise HTTPException(422, f"第 {index} 题的简答题不能包含选项")
        elif (
            len(question.options) < 2
            or not all(question.options)
            or len(set(question.options)) != len(question.options)
        ):
            raise HTTPException(422, f"第 {index} 题需要至少两个不同的非空选项")


def checked_answers(content: SurveyContent, answers: dict) -> dict:
    if answers.keys() - {question.id for question in content.questions}:
        raise HTTPException(422, "答卷包含未知题目")
    normalized = {}
    for index, question in enumerate(content.questions, start=1):
        value = answers.get(question.id)
        if isinstance(value, str):
            value = value.strip()
        if not value:
            if question.required:
                raise HTTPException(422, f"请完成第 {index} 题")
            continue

        if question.type == "text":
            valid = isinstance(value, str) and len(value) <= 1000
        elif question.type == "single":
            valid = isinstance(value, str) and value in question.options
        else:
            valid = (
                isinstance(value, list)
                and set(value) <= set(question.options)
                and len(value) == len(set(value))
            )
            if valid:
                value = [option for option in question.options if option in value]
        if not valid:
            raise HTTPException(422, f"第 {index} 题的答案格式有误")
        normalized[question.id] = value
    return normalized
