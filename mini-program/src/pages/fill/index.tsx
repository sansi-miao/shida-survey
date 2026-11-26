import { Button, Checkbox, CheckboxGroup, Input, Label, Radio, RadioGroup, Text, Textarea, View } from "@tarojs/components";
import Taro, { useRouter, useShareAppMessage } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import type { Answers, PublishedSurvey, Question, Submission } from "../../../../shared/survey";

async function callApi<T>(path: string, data?: Submission): Promise<T> {
  const response = await Taro.request<T>({
    url: SURVEY_API_BASE + path,
    method: data ? "POST" : "GET",
    data,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as { detail?: unknown };
    throw new Error(typeof body?.detail === "string" ? body.detail : "请求失败，请稍后重试");
  }
  return response.data;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "无法连接问卷服务，请检查网络后重试";
}

function submissionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 3) | 8).toString(16);
  });
}

function QuestionField({
  question, index, answer, change, disabled,
}: {
  question: Question;
  index: number;
  answer: string | string[] | undefined;
  change: (answer: string | string[]) => void;
  disabled: boolean;
}) {
  function optionLabel(option: string, optionIndex: number) {
    const id = question.id + "-" + optionIndex;
    const control = question.type === "single"
      ? <Radio id={id} value={option} checked={answer === option} color="#5146cb" disabled={disabled} />
      : <Checkbox id={id} value={option} checked={Array.isArray(answer) && answer.includes(option)}
          color="#5146cb" disabled={disabled} />;
    return <Label className="choice" key={option} for={id}>{control}<Text>{option}</Text></Label>;
  }

  return <View className="card question">
    <View className="question-title"><Text className="number">{index + 1}. </Text>{question.title}
      {question.required && <Text className="required"> *</Text>}
    </View>
    {question.type === "multiple" && <Text className="hint">可多选</Text>}
    {question.type === "text"
      ? <Textarea className="answer-box" placeholder="请输入你的回答" disabled={disabled}
          value={typeof answer === "string" ? answer : ""} maxlength={1000}
          onInput={event => change(event.detail.value)} />
      : question.type === "single"
        ? <RadioGroup onChange={event => change(event.detail.value)}>{question.options.map(optionLabel)}</RadioGroup>
        : <CheckboxGroup onChange={event => change(event.detail.value)}>{question.options.map(optionLabel)}</CheckboxGroup>}
  </View>;
}

export default function Fill() {
  const router = useRouter();
  const initial = router.params.id || "";
  const [lookup, setLookup] = useState(initial);
  const [id, setId] = useState(initial);
  const [survey, setSurvey] = useState<PublishedSurvey>();
  const [answers, setAnswers] = useState<Answers>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(Boolean(initial));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const key = useRef("");
  const endpoint = "/api/public/surveys/" + encodeURIComponent(id);

  useShareAppMessage(() => ({
    title: survey?.title || "拾答问卷",
    path: "/pages/fill/index" + (id ? "?id=" + encodeURIComponent(id) : ""),
  }));

  useEffect(() => {
    if (!id) return;
    let current = true;
    setLoading(true);
    setError("");
    setSurvey(undefined);
    setAnswers({});
    setDone(false);
    key.current = "";
    callApi<PublishedSurvey>(endpoint).then(value => {
      if (current) setSurvey(value);
    }).catch(error => {
      if (current) setError(message(error));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [id, endpoint, attempt]);

  async function submit() {
    if (!survey || pending.current || done) return;
    const missing = survey.questions.findIndex(question => {
      const value = answers[question.id];
      return question.required && (!value || (typeof value === "string" ? !value.trim() : !value.length));
    });
    if (missing >= 0) {
      setError("请完成第 " + (missing + 1) + " 题");
      return;
    }

    pending.current = true;
    setSending(true);
    setError("");
    key.current ||= submissionId();
    try {
      await callApi(endpoint + "/responses", { id: key.current, version: survey.version, answers });
      setDone(true);
    } catch (error) {
      setError(message(error));
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  if (done) return <View className="page"><View className="card success">
    <Text className="success-mark">✓</Text><Text className="main-title">答卷已提交</Text><Text className="hint">谢谢你的反馈。</Text>
  </View></View>;

  return <View className="page">
    {survey ? <>
      <View className="card heading">
        <View className="chapter-mark" /><Text className="main-title">{survey.title}</Text>
        {survey.description && <Text className="description">{survey.description}</Text>}
      </View>
      {survey.questions.map((question, index) =>
        <QuestionField key={question.id} question={question} index={index} answer={answers[question.id]}
          disabled={sending} change={answer => setAnswers(previous => ({ ...previous, [question.id]: answer }))} />
      )}
      {error && <View className="error">{error}</View>}
      <Button className="primary" loading={sending} disabled={sending} onClick={submit}>提交问卷</Button>
    </> : <View className="card heading">
      <View className="chapter-mark" /><Text className="main-title">拾答问卷</Text>
      {loading ? <Text className="hint">正在打开问卷…</Text> : <>
        <Text className="hint">请输入问卷编号</Text>
        <Input className="survey-id" value={lookup} onInput={event => setLookup(event.detail.value)} placeholder="例如 market-feedback" />
        {error && <View className="error">{error}</View>}
        <Button className="primary" disabled={!lookup.trim()} onClick={() => {
          setId(lookup.trim());
          setAttempt(value => value + 1);
        }}>打开问卷</Button>
      </>}
    </View>}
  </View>;
}
