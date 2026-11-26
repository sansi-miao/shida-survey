import csv
import io
import os
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

from .main import create_app


class SurveyFlow(unittest.TestCase):
    def setUp(self):
        app = create_app(self.database_url(), admin_token="test-access")
        self.client = self.enterContext(TestClient(app))
        self.headers = {"Authorization": "Bearer test-access"}
        entry = self.client.post("/api/admin/surveys", headers=self.headers)
        self.assertEqual(entry.status_code, 201, entry.text)
        self.survey_id = entry.json()["id"]
        self.admin = "/api/admin/surveys/" + self.survey_id
        self.public = "/api/public/surveys/" + self.survey_id

    def database_url(self):
        postgres_url = os.environ.get("SURVEY_TEST_POSTGRES_URL")
        if not postgres_url:
            temporary = tempfile.TemporaryDirectory(dir=Path.cwd())
            self.addCleanup(temporary.cleanup)
            return "sqlite:///" + (Path(temporary.name) / "test.db").as_posix()

        url = make_url(postgres_url)
        if url.get_backend_name() != "postgresql":
            raise ValueError("SURVEY_TEST_POSTGRES_URL must be a PostgreSQL URL")
        engine = create_engine(url)
        self.addCleanup(engine.dispose)
        schema = "survey_test_" + uuid4().hex
        with engine.begin() as connection:
            connection.execute(CreateSchema(schema))
        self.addCleanup(self.drop_test_schema, engine, schema)
        prior_options = url.query.get("options", "")
        scoped_options = f"{prior_options} -csearch_path={schema}".strip()
        return url.update_query_dict({"options": scoped_options}).render_as_string(hide_password=False)

    @staticmethod
    def drop_test_schema(engine, schema):
        with engine.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True))

    def save(self, label="喜欢吗？", revision=1):
        return self.client.put(self.admin, headers=self.headers, json={
            "revision": revision,
            "draft": {"title": "活动反馈", "questions": [
                {"id": "rating", "type": "single", "title": label, "options": ["喜欢", "一般"]},
                {"id": "detail", "type": "text", "title": "原因", "required": False},
            ]},
        })

    def publish(self, revision):
        return self.client.post(self.admin + "/publish", headers=self.headers, json={
            "revision": revision,
        })

    def submit(self, payload):
        return self.client.post(self.public + "/responses", json=payload)

    def report(self, version):
        response = self.client.get(self.admin + "/results", headers=self.headers, params={
            "version": version,
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_publish_preserves_titles_and_responses_across_versions(self):
        self.assertEqual(self.client.get(self.public).status_code, 404)
        first = self.save()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.publish(2).json()["published_version"], 1)
        self.assertEqual(self.publish(2).json()["published_version"], 1)

        second = self.save("改版后的题目", revision=2)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(self.client.get(self.public).json()["questions"][0]["title"], "喜欢吗？")
        self.assertEqual(self.publish(3).json()["published_version"], 2)
        self.assertEqual(self.client.get(self.public).json()["questions"][0]["title"], "改版后的题目")

        for version, answer in [(1, "喜欢"), (2, "一般")]:
            result = self.submit({"id": str(uuid4()), "version": version, "answers": {"rating": answer}})
            self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(self.report(1)["questions"][0]["title"], "喜欢吗？")
        self.assertEqual(self.report(1)["questions"][0]["counts"], {"喜欢": 1, "一般": 0})
        self.assertEqual(self.report(2)["questions"][0]["counts"], {"喜欢": 0, "一般": 1})

    def test_concurrent_retries_keep_one_response_and_escape_csv_cells(self):
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.publish(2).status_code, 200)
        payload = {"id": str(uuid4()), "version": 1, "answers": {
            "rating": "喜欢", "detail": "=1+1",
        }}
        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(self.submit, [payload, payload]))
        self.assertEqual([response.status_code for response in responses], [201, 201])
        self.assertEqual(self.report(1)["response_count"], 1)
        payload["answers"]["rating"] = "一般"
        self.assertEqual(self.submit(payload).status_code, 409)

        exported = self.client.get(self.admin + "/results.csv", headers=self.headers)
        rows = list(csv.reader(io.StringIO(exported.content.decode("utf-8-sig"))))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0][-2:], ["喜欢吗？", "原因"])
        self.assertEqual(rows[1][-2:], ["喜欢", "'=1+1"])

    def test_invalid_answers_drafts_and_unauthorized_result_access(self):
        self.assertEqual(self.publish(1).status_code, 422)
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.save("过期草稿").status_code, 409)
        self.assertEqual(self.publish(2).status_code, 200)
        self.assertEqual(self.client.get(self.admin + "/results").status_code, 401)
        for answers in [{}, {"rating": "未知选项"}, {"rating": "喜欢", "extra": "未知题目"}]:
            payload = {"id": str(uuid4()), "version": 1, "answers": answers}
            self.assertEqual(self.submit(payload).status_code, 422)
        self.assertEqual(self.report(1)["response_count"], 0)

    def test_parallel_draft_edits_preserve_the_winner(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            edits = list(pool.map(self.save, ["甲打开时的题目", "乙打开时的题目"]))
        self.assertEqual(sorted(response.status_code for response in edits), [200, 409])
        winner = next(response.json() for response in edits if response.status_code == 200)
        self.assertEqual(winner["revision"], 2)
        self.assertEqual(self.publish(2).status_code, 200)
        published = self.client.get(self.public).json()
        self.assertEqual(published["questions"], winner["draft"]["questions"])


if __name__ == "__main__":
    unittest.main()
