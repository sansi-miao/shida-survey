import type { Answers, Question, QuestionKind, SurveyContent } from "../../shared/survey";

export const questionLabels: Record<QuestionKind, string> = {
  single: "单选题", multiple: "多选题", text: "简答题",
};

export function FormFields({
  content, answers, setAnswers, preview = false,
}: {
  content: SurveyContent;
  answers: Answers;
  setAnswers: (answers: Answers) => void;
  preview?: boolean;
}) {
  function update(question: Question, value: string) {
    if (question.type === "multiple") {
      const current = answers[question.id];
      const selected = Array.isArray(current) ? current : [];
      setAnswers({ ...answers, [question.id]: selected.includes(value)
        ? selected.filter(option => option !== value) : [...selected, value] });
    } else {
      setAnswers({ ...answers, [question.id]: value });
    }
  }

  return <div className="form-fields">
    {content.questions.map((question, index) => {
      const answer = answers[question.id];
      return <fieldset className="fill-question" key={question.id}>
        <legend>
          <span className="prompt-number">{index + 1}.</span>{" "}
          {question.title || "未填写题目"}{question.required && <span className="required" aria-label="必填"> *</span>}
        </legend>
        {question.type === "multiple" && <span className="question-hint">可多选</span>}
        {question.type === "text"
          ? <textarea aria-label={question.title || "简答题"} required={question.required && !preview}
              maxLength={1000} placeholder="请输入你的回答" value={typeof answer === "string" ? answer : ""}
              onChange={event => update(question, event.target.value)} rows={3} />
          : <div className="fill-options">
            {question.options.map((option, optionIndex) => (
              <label className="fill-option" key={optionIndex}>
                <input name={(preview ? "preview-" : "") + question.id}
                  type={question.type === "single" ? "radio" : "checkbox"}
                  value={option} required={question.type === "single" && question.required && !preview}
                  checked={Array.isArray(answer) ? answer.includes(option) : answer === option}
                  onChange={() => update(question, option)} />
                <span>{option || "未填写选项"}</span>
              </label>
            ))}
          </div>}
      </fieldset>;
    })}
  </div>;
}

export function SurveyHeading({ content }: { content: SurveyContent }) {
  return <header className="form-heading">
    <span className="form-mark" aria-hidden="true" />
    <h2>{content.title || "未命名问卷"}</h2>
    {content.description && <p>{content.description}</p>}
  </header>;
}
