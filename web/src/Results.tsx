import { useEffect, useState } from "react";
import { BarChart3, Download, MessageSquareText } from "lucide-react";
import type { SurveyResults } from "../../shared/survey";
import { explain, query, request } from "./api";

export function Results({ id, latest }: { id: string; latest: number }) {
  const [version, setVersion] = useState(latest);
  const [data, setData] = useState<SurveyResults>();
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const base = "/api/admin/surveys/" + id + "/results";

  useEffect(() => {
    if (!version) return;
    let current = true;
    setData(undefined);
    setError("");
    query<SurveyResults>(base + "?version=" + version).then(report => {
      if (current) setData(report);
    }).catch(error => {
      if (current) setError(explain(error));
    });
    return () => { current = false; };
  }, [base, version]);

  async function download() {
    setExporting(true);
    setError("");
    try {
      const response = await request(base + ".csv?version=" + version);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "survey-" + id + "-v" + version + ".csv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setError(explain(error));
    } finally {
      setExporting(false);
    }
  }

  if (!latest) return <div className="panel empty-state"><BarChart3 /><h2>发布后可查看数据</h2></div>;
  return <div className="results">
    <section className="panel results-toolbar">
      <div><span className="quiet">该版本有效答卷</span><strong>{data?.response_count ?? "…"}</strong></div>
      <div className="results-actions">
        <label className="edit-label result-version">问卷版本
          <select value={version} onChange={event => setVersion(Number(event.target.value))}>
            {Array.from({ length: latest }, (_, index) => latest - index).map(value =>
              <option value={value} key={value}>第 {value} 版{value === latest ? "（最新）" : ""}</option>
            )}
          </select>
        </label>
        <button className="button secondary" disabled={exporting || !data} onClick={download}><Download size={16} />导出 CSV</button>
      </div>
    </section>
    {error && <p className="alert" role="alert">{error}</p>}
    {!data && !error && <p className="quiet" role="status">正在读取数据…</p>}
    {data?.questions.map((question, index) =>
      <article className="panel result-card" key={question.id}>
        <div className="section-heading">
          <h2>{index + 1}. {question.title}</h2><span className="quiet">{question.answered} 人作答</span>
        </div>
        {question.counts && question.options.map(option => {
          const count = question.counts?.[option] ?? 0;
          const percent = question.answered ? Math.round(count * 100 / question.answered) : 0;
          return <div className="bar-row" key={option}>
            <div className="bar-label"><span>{option}</span><span>{count} 人 · {percent}%</span></div>
            <div className="bar-track"><div style={{ width: percent + "%" }} /></div>
          </div>;
        })}
        {question.samples && (question.samples.length
          ? <ul className="responses">{question.samples.map((sample, index) => <li key={index}><MessageSquareText size={16} />{sample}</li>)}</ul>
          : <p className="quiet">暂无文字回答</p>)}
      </article>
    )}
  </div>;
}
