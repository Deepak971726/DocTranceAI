import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackFaqs,
  groundFaq,
  parseFaqItems,
} from "../src/services/generation.js";

test("FAQ parser normalizes local model variations", () => {
  const items = parseFaqItems({
    questions: [
      {
        q: "Where did she study?",
        a: "She studied at Example Institute [C2].",
        citation: "[C2]",
      },
      {
        question: "What was her CGPA?",
        answer: "Her CGPA was 8.2 [C3].",
        citations: [3],
      },
      { question: "", answer: "Invalid" },
    ],
  });
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].citations, ["C2"]);
  assert.deepEqual(items[1].citations, ["C3"]);
});

test("uncited FAQs are matched to a source chunk", () => {
  const faq = groundFaq(
    {
      question: "Which programming languages are listed?",
      answer: "Java and SQL are listed.",
      citations: [],
    },
    [
      { chunk_index: 0, chunk_text: "Java and SQL programming skills." },
      { chunk_index: 1, chunk_text: "Kalpataru Institute education history." },
    ],
  );
  assert.deepEqual(faq.citations, ["C1"]);
  assert.ok(faq.answer.endsWith("[C1]"));
});

test("grounded fallback can create twenty FAQs from one chunk", () => {
  const seen = new Set();
  const fallback = fallbackFaqs(
    [{ chunk_index: 0, chunk_text: "Grounded document content." }],
    seen,
    20,
  );
  assert.equal(fallback.length, 20);
  assert.ok(fallback.every((item) => item.citations[0] === "C1"));
});
