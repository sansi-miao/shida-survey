import { type FormEvent, useEffect, useRef, useState } from "react";
import { BarChart3, Check, ClipboardList, Copy, FileText, Link2, MessageSquareText, Plus, X } from "lucide-react";
import type { ListedSurvey, SavedSurvey, SurveyContent } from "../../shared/survey";
import { ApiError, explain, query, setToken } from "./api";
import { Editor } from "./Editor";
import { Results } from "./Results";

const surveysPath = "/api/admin/surveys";

function ShareDialog({ id, close }: { id: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [feedback, setFeedback] = useState("");
  const webUrl = location.origin + "/s/" + id;
  const miniPath = "/pages/fill/index?id=" + id;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback("已复制");
    } catch {
      setFeedback("无法访问剪贴板，可以直接选中并复制。");
    }
  }

  return <dialog className="share-dialog" ref={dialog} onCancel={close} aria-labelledby="share-title">
    <div className="section-heading">
      <h2 id="share-title">分享问卷</h2>
      <button className="icon-button" aria-label="关闭分享" onClick={close}><X size={20} /></button>
    </div>
    <label className="edit-label">网页填写链接
      <div className="share-row"><input readOnly value={webUrl} onFocus={event => event.target.select()} />
        <button className="button secondary" onClick={() => void copy(webUrl)}><Copy size={15} />复制</button></div>
    </label>
    <label className="edit-label">小程序页面路径
      <div className="share-row"><input readOnly value={miniPath} onFocus={event => event.target.select()} />
        <button className="button secondary" onClick={() => void copy(miniPath)}><Copy size={15} />复制</button></div>
    </label>
    <div className="share-footer"><a className="button primary" href={webUrl} target="_blank" rel="noreferrer">打开填写页</a>
      <span role="status">{feedback}</span></div>
  </dialog>;
}

export function Admin() {
  const [surveys, setSurveys] = useState<ListedSurvey[]>([]);
  const [saved, setSaved] = useState<SavedSurvey>();
  const [draft, setDraft] = useState<SurveyContent>();
  const [tab, setTab] = useState<"edit" | "results">("edit");
  const [busy, setBusy] = useState("载入中…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [share, setShare] = useState(false);
  const dirty = Boolean(saved && draft && draft !== saved.draft);

  function useSurvey(value: SavedSurvey) {
    setSaved(value);
    setDraft(value.draft);
  }

  function showError(error: unknown) {
    if (error instanceof ApiError && error.status === 401) setLocked(true);
    setError(explain(error));
  }

  async function refreshList() {
    const list = await query<ListedSurvey[]>(surveysPath);
    setSurveys(list);
    return list;
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      showError(error);
    } finally {
      setBusy("");
    }
  }

  function load() {
    return run("载入中…", async () => {
      const list = await refreshList();
      if (list[0] && !saved) useSurvey(await query<SavedSurvey>(surveysPath + "/" + list[0].id));
      setLocked(false);
    });
  }

  useEffect(() => { void load(); }, []);

  function confirmSwitch() {
    return !dirty || window.confirm("这份问卷有未保存的修改。要离开吗？");
  }

  function select(id: string) {
    if (id === saved?.id || !confirmSwitch()) return;
    void run("打开中…", async () => {
      useSurvey(await query<SavedSurvey>(surveysPath + "/" + id));
      setTab("edit");
    });
  }

  function create() {
    if (!confirmSwitch()) return;
    void run("新建中…", async () => {
      useSurvey(await query<SavedSurvey>(surveysPath, "POST"));
      setTab("edit");
      await refreshList();
      setNotice("已创建问卷");
    });
  }

  function persist(publish: boolean) {
    if (!saved || !draft) return;
    const path = surveysPath + "/" + saved.id;
    void run(publish ? "发布中…" : "保存中…", async () => {
      let revision = saved.revision;
      if (dirty) {
        const updated = await query<SavedSurvey>(path, "PUT", { revision, draft });
        useSurvey(updated);
        revision = updated.revision;
      }
      if (publish) {
        useSurvey(await query<SavedSurvey>(path + "/publish", "POST", { revision }));
      }
      await refreshList();
      setNotice(publish ? "发布成功" : "草稿已保存");
    });
  }

  function unlock(event: FormEvent) {
    event.preventDefault();
    setToken(password.trim());
    void load();
  }

  const published = saved?.published_version ?? 0;
  const shipped = saved && published > 0 && !dirty && saved.revision === saved.published_revision;
  const currentTitle = draft?.title.trim() || "未命名问卷";
  const status = published ? (shipped ? "已发布" : "有未发布更改") : "草稿";

  if (locked) return <main className="public-shell">
    <form className="panel login" onSubmit={unlock}>
      <div className="brand-icon"><MessageSquareText size={22} /></div>
      <h1>问卷工作台</h1>
      <label className="edit-label">后台访问口令<input type="password" required value={password}
        onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
      {error && <p className="alert" role="alert">{error}</p>}
      <button type="submit" className="button primary" disabled={!!busy}>进入工作台</button>
    </form>
  </main>;

  return <div className="workspace">
    <aside className="sidebar" aria-label="问卷导航">
      <div className="brand"><div className="brand-icon"><MessageSquareText size={22} /></div>
        <div><strong>拾答</strong><span>活动反馈问卷</span></div>
      </div>
      <div className="library-heading"><ClipboardList size={18} /><h2>问卷库</h2><span>{surveys.length}</span></div>
      <button className="button new-survey" type="button" onClick={create} disabled={!!busy}><Plus size={18} /> 新建问卷</button>
      <ul className="survey-list">
        {surveys.map(item => (
          <li key={item.id}>
            <button type="button" className={"survey-link" + (item.id === saved?.id ? " selected" : "")}
              aria-current={item.id === saved?.id ? "page" : undefined} onClick={() => select(item.id)} disabled={!!busy}>
              <FileText size={17} />
              <span><strong>{item.title || "未命名问卷"}</strong>
                <small>{item.published_version ? item.response_count + " 份答卷" : "草稿"}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
    <main className="workspace-main">
      <header className="workspace-header">
        <div className="workspace-breadcrumb"><ClipboardList size={16} /> 问卷工作台</div>
        {draft && saved && <>
          <div className="workspace-title">
            <div className="title-line"><h1>{currentTitle}</h1><span className={"status " + (shipped ? "published" : "draft")}>{status}</span></div>
            <div className="main-actions">
              {published > 0 && <button type="button" className="button secondary" onClick={() => setShare(true)}><Link2 size={16} />分享</button>}
              <button type="button" className="button secondary" onClick={() => persist(false)} disabled={!dirty || !!busy}>保存草稿</button>
              <button type="button" className="button primary" onClick={() => persist(true)} disabled={!!busy || Boolean(shipped)}>{published ? "发布新版本" : "发布问卷"}</button>
            </div>
          </div>
          <nav className="tabs" aria-label="问卷视图">
            <button type="button" className={tab === "edit" ? "current" : ""} onClick={() => setTab("edit")}
              aria-pressed={tab === "edit"}><FileText size={16} />编辑问卷</button>
            <button type="button" className={tab === "results" ? "current" : ""} onClick={() => setTab("results")}
              aria-pressed={tab === "results"}><BarChart3 size={17} />数据统计</button>
            <span className="save-state" role="status">{busy || (notice ? <><Check size={15} />{notice}</> : dirty ? "有未保存修改" : saved.published_version ? "已发布第 " + saved.published_version + " 版" : "草稿已保存")}</span>
          </nav>
        </>}
      </header>
      <div className="main-content">
        {error && <div className="alert" role="alert">{error} {!saved && <button type="button" className="text-button" onClick={() => void load()}>重试</button>}</div>}
        {saved && draft
          ? tab === "edit"
            ? <Editor key={saved.id} content={draft} onChange={setDraft} locked={!!busy} />
            : <Results key={saved.id + "-" + published} id={saved.id} latest={published} />
          : !error && <div className="panel empty-state">
              <MessageSquareText /><h1>{busy ? "正在打开工作台…" : "创建第一份问卷"}</h1>
              {!busy && <button className="button primary" onClick={create}><Plus size={17} />新建问卷</button>}
            </div>}
      </div>
    </main>
    {share && saved && <ShareDialog id={saved.id} close={() => setShare(false)} />}
  </div>;
}
