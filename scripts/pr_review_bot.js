// scripts/pr_review_bot.js
import { Octokit } from "@octokit/rest";
import OpenAI from "openai";

// 환경변수 읽기
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// 리포지토리 정보 추출
const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const ref = process.env.GITHUB_REF;

// refs/pull/123/merge → 123 추출
const match = ref.match(/refs\/pull\/(\d+)\/merge/);
if (!match) {
  console.error("❌ PR 번호를 찾을 수 없습니다. (GITHUB_REF 확인 필요)");
  process.exit(1);
}
const prNumber = match[1];

(async () => {
  try {
    console.log(`🔍 Fetching PR #${prNumber} info from ${owner}/${repo} ...`);
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });

    // diff 가져오기
    const diffResp = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner,
      repo,
      pull_number: prNumber,
      headers: { accept: "application/vnd.github.v3.diff" },
    });

    const diff = diffResp.data;

    // 프롬프트 템플릿
    const prompt = `
너는 경험 많은 시니어 개발자이자 코드 리뷰어야.
아래의 PR diff를 보고 개선할 부분, 코드 스타일, 보안, 가독성, 논리적 오류를 검토해줘.

--- PR 제목 ---
${pr.title}

--- PR 설명 ---
${pr.body || "(설명 없음)"}

--- 코드 변경 내용(diff) ---
${diff.slice(0, 5000)}   // 너무 크면 모델이 터질 수 있으니 앞부분 제한
출력은 다음 포맷으로 해줘:

[요약]
- 주요 변경 요약 (1~2줄)
- 핵심 개선 포인트

[리뷰 상세]
1. (파일명:줄번호) 문제점 및 제안
2. ...
`;

    console.log("🤖 Generating AI review...");
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const reviewText = aiResponse.choices[0].message.content.trim();

    console.log("💬 Posting review comment to PR...");
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: `🤖 **AI Code Review Bot**  
      
${reviewText}`,
    });

    console.log("✅ Review posted successfully!");
  } catch (err) {
    console.error("🚨 Error:", err.message);
    process.exit(1);
  }
})();
