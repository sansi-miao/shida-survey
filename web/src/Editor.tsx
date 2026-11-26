import { useState } from "react";
import { AlignLeft, CheckSquare, ChevronDown, ChevronUp, CircleDot, ListPlus, Plus, Smartphone, Trash2, X } from "lucide-react";
import type { Answers, Question, QuestionKind, SurveyContent } from "../../shared/survey";
import { FormFields, questionLabels, SurveyHeading } from "./questions";

const questionIcons = { single: CircleDot, multiple: CheckSquare, text: AlignLeft };
const questionKinds = Object.keys(questionLabels) as QuestionKind[];

export function Editor({
  content, onChange, locked,
}: {
  content: SurveyContent;
  onChange: (content: SurveyContent) => void;
  locked: boolean;
}) {
  const [active, setActive] = useState<string>();
  const [previewAnswers, setPreviewAnswers] = useState<Answers>({});

  function replaceQuestion(index: number, question: Question) {
    changeQuestions(content.questions.map((item, position) => position === index ? question : item));
  }

  function changeQuestions(questions: Question[]) {
    setPreviewAnswers({});
    onChange({ ...content, questions });
  }

  function addQuestion(type: QuestionKind) {
    if (content.questions.length === 12) return;
    const id = crypto.randomUUID();
    const question: Question = {
      id, type, title: "", required: true,
      options: type === "text" ? [] : ["", ""],
    };
    setActive(id);
    changeQuestions([...content.questions, question]);
  }

  function moveQuestion(from: number, to: number) {
    const questions = [...content.questions];
    const [question] = questions.splice(from, 1);
    questions.splice(to, 0, question);
    changeQuestions(questions);
  }

  return <div className="editor-grid">
    <fieldset className="editor-main" disabled={locked}>
      <section className="panel survey-meta">
        <div className="section-heading"><h2>基本信息</h2></div>
        <label className="edit-label">问卷标题
          <input value={content.title} maxLength={120} onChange={event => onChange({ ...content, title: event.target.value })} />
        </label>
        <label className="edit-label">问卷说明
          <textarea value={content.description} maxLength={500} rows={2} placeholder="选填"
            onChange={event => onChange({ ...content, description: event.target.value })} />
        </label>
      </section>
      <section className="question-section" aria-labelledby="questions-heading">
        <div className="section-heading">
          <h2 id="questions-heading">题目</h2><span className="quiet">{content.questions.length} / 12</span>
        </div>
        <div className="question-list">
          {content.questions.map((question, index) => {
            const Icon = questionIcons[question.type];
            return <article className={"panel question-card" + (active === question.id ? " question-active" : "")}
              key={question.id} onFocus={() => setActive(question.id)}>
              <div className="question-top">
                <div className="question-label"><span className="number">{index + 1}</span><Icon size={16} />{questionLabels[question.type]}</div>
                <div className="question-tools">
                  <button type="button" className="icon-button" title="上移" aria-label={"上移第 " + (index + 1) + " 题"} disabled={index === 0}
                    onClick={() => moveQuestion(index, index - 1)}><ChevronUp size={17} /></button>
                  <button type="button" className="icon-button" title="下移" aria-label={"下移第 " + (index + 1) + " 题"} disabled={index + 1 === content.questions.length}
                    onClick={() => moveQuestion(index, index + 1)}><ChevronDown size={17} /></button>
                  <button type="button" className="icon-button remove" title="删除题目" aria-label={"删除第 " + (index + 1) + " 题"}
                    onClick={() => changeQuestions(content.questions.filter(item => item.id !== question.id))}><Trash2 size={16} /></button>
                </div>
              </div>
              <input aria-label={"第 " + (index + 1) + " 题标题"} placeholder="请输入题目" value={question.title}
                maxLength={120} onChange={event => replaceQuestion(index, { ...question, title: event.target.value })} />
              {question.type !== "text" && <div className="editor-options">
                {question.options.map((option, optionIndex) => (
                  <div className="option-row" key={optionIndex}>
                    <span className={"option-decoration " + question.type} aria-hidden="true" />
                    <input aria-label={"第 " + (index + 1) + " 题选项 " + (optionIndex + 1)}
                      placeholder={"选项 " + (optionIndex + 1)} value={option} maxLength={120}
                      onChange={event => replaceQuestion(index, { ...question,
                        options: question.options.map((item, position) => position === optionIndex ? event.target.value : item) })} />
                    <button type="button" className="icon-button" aria-label={"删除选项 " + (optionIndex + 1)}
                      disabled={question.options.length <= 2}
                      onClick={() => replaceQuestion(index, { ...question,
                        options: question.options.filter((_, position) => position !== optionIndex) })}><X size={15} /></button>
                  </div>
                ))}
                {question.options.length < 8 && <button type="button" className="text-button"
                  onClick={() => replaceQuestion(index, { ...question, options: [...question.options, ""] })}>
                  <Plus size={16} /> 添加选项
                </button>}
              </div>}
              <div className="question-footer">
                <label className="required-toggle"><input type="checkbox" checked={question.required}
                  onChange={event => replaceQuestion(index, { ...question, required: event.target.checked })} />必填</label>
              </div>
            </article>;
          })}
        </div>
        <div className="add-zone">
          <div><ListPlus size={19} /> 添加题目</div>
          <div className="add-options">
            {questionKinds.map(type => {
              const Icon = questionIcons[type];
              return <button type="button" className="button secondary" key={type}
                disabled={content.questions.length === 12} onClick={() => addQuestion(type)}>
                <Icon size={16} />{questionLabels[type]}
              </button>;
            })}
          </div>
        </div>
      </section>
    </fieldset>
    <aside className="preview-column" aria-label="手机预览">
      <div className="section-heading"><h2><Smartphone size={16} /> 手机预览</h2><span className="quiet">草稿</span></div>
      <div className="preview-frame">
        <div className="phone-top"><span></span></div>
        <div className="preview-content">
          <SurveyHeading content={content} />
          {content.questions.length > 0
            ? <FormFields content={content} answers={previewAnswers} setAnswers={setPreviewAnswers} preview />
            : <p className="quiet empty-preview">添加题目后在这里预览</p>}
          <button className="button primary preview-submit" type="button" disabled>提交问卷</button>
        </div>
      </div>
    </aside>
  </div>;
}
