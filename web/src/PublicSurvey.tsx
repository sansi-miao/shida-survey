import { type FormEvent, useEffect, useRef, useState } from "react";
import { Check, MessageSquareText } from "lucide-react";
import type { Answers, PublishedSurvey } from "../../shared/survey";
import { ApiError, explain, query } from "./api";
import { FormFields, SurveyHeading } from "./questions";

export function PublicSurvey({ id }: { id: string }) {
  const [survey, setSurvey] = useState<PublishedSurvey>();
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const sending = useRef(false);
  const key = useRef("");
  const path = "/api/public/surveys/" + encodeURIComponent(id);

  useEffect(() => {
    let current = true;
    query<PublishedSurvey>(path).then(value => {
      if (current) setSurvey(value);
    }).catch(error => {
      if (current) setError(explain(error));
    });
    return () => { current = false; };
  }, [path]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!survey || sending.current || done) return;
    const missing = survey.questions.findIndex(question => {
      const answer = answers[question.id];
      return question.required && (!answer || (typeof answer === "string" ? !answer.trim() : !answer.length));
    });
    if (missing >= 0) {
      setError("请完成第 " + (missing + 1) + " 题");
      return;
    }
    sending.current = true;
    setPending(true);
    setError("");
    key.current ||= crypto.randomUUID();
    try {
      await query(path + "/responses", "POST", { id: key.current, version: survey.version, answers });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) key.current = "";
      setError(explain(error));
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return <main className="public-shell">
    <div className="public-brand"><MessageSquareText size={19} /> 拾答</div>
    <div className="panel public-card">
      {done
        ? <div className="empty-state success" role="status"><Check /><h1>答卷已提交</h1><p>谢谢你的反馈。</p></div>
        : survey
          ? <form onSubmit={submit}>
              <SurveyHeading content={survey} />
              <fieldset disabled={pending} className="public-fields">
                <FormFields content={survey} answers={answers} setAnswers={setAnswers} />
                {error && <p className="alert" role="alert">{error}</p>}
                <button className="button primary public-submit" type="submit">{pending ? "提交中…" : "提交问卷"}</button>
              </fieldset>
            </form>
          : <div className="empty-state" role={error ? "alert" : "status"}><p>{error || "正在打开问卷…"}</p></div>}
    </div>
  </main>;
}
