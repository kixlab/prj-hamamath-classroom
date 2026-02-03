function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}


function formatAnswer(answer) {
  if (!answer) return "";
  // 백슬래시만 있는 경우 제거 (LaTeX 수식 오류 방지)
  answer = answer.trim();
  if (/^\\+$/.test(answer)) return "";
  // 단독 백슬래시 제거 (앞뒤 공백만 있는 경우)
  answer = answer.replace(/(^|\s)\\(\s|$)/g, "$1$2").trim();
  if (!answer) return "";
  // 줄바꿈 문자를 <br> 태그로 변환 (백엔드에서 이미 대시를 줄바꿈으로 변환함)
  answer = answer.replace(/\n/g, "<br>");
  // 등호(=) 뒤에 숫자가 오고 그 다음에 공백이 오는 패턴을 <br> 태그로 변환
  // 예: "23 × 14 = 322 24 × 7 = 168" → "23 × 14 = 322<br>24 × 7 = 168"
  return answer.replace(/(=\s*\d+)\s+(?=\d)/g, "$1<br>");
}

function formatQuestion(question) {
  if (!question) return "";
  // 백슬래시만 있는 경우 제거 (LaTeX 수식 오류 방지)
  question = question.trim();
  if (/^\\+$/.test(question)) return "";
  // 단독 백슬래시 제거 (앞뒤 공백만 있는 경우)
  question = question.replace(/(^|\s)\\(\s|$)/g, "$1$2").trim();
  return question || "";
}

function formatVerificationResult(verificationResult) {
  if (!verificationResult || !verificationResult.trim()) return "";

  // verification_result 파싱: "[Verifier 이름] 점수: X\n[평가 요약]\n...\n[개선 제안]\n..." 형식
  // 여러 verifier 결과는 "\n[Verifier 이름]" 또는 "\n [Verifier 이름]" 패턴으로 구분됨
  // TSV에서 읽은 경우 공백으로 시작하는 줄도 있을 수 있음
  
  // 먼저 앞뒤 따옴표 제거 (TSV에서 읽은 경우 따옴표로 감싸져 있을 수 있음)
  let cleanedResult = verificationResult.trim();
  if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
    cleanedResult = cleanedResult.slice(1, -1);
  }
  
  // 줄바꿈으로 분리하고, 각 줄이 "[Verifier 이름] 점수:"로 시작하는지 확인
  const lines = cleanedResult.split(/\n/);
  const verifierBlocks = [];
  let currentBlock = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // 빈 줄은 건너뛰기
    
    // "[Verifier 이름] 점수:" 패턴으로 시작하는 줄인지 확인
    if (line.match(/^\[[^\]]+\]\s*점수:/)) {
      // 이전 블록이 있으면 저장
      if (currentBlock.trim()) {
        verifierBlocks.push(currentBlock.trim());
      }
      // 새 블록 시작
      currentBlock = line;
    } else if (currentBlock) {
      // 현재 블록에 추가
      currentBlock += "\n" + line;
    } else {
      // 첫 번째 블록이 아직 시작되지 않았는데 verifier 패턴이 아니면, 첫 번째 블록으로 시작
      currentBlock = line;
    }
  }
  
  // 마지막 블록 추가
  if (currentBlock.trim()) {
    verifierBlocks.push(currentBlock.trim());
  }
  
  // 블록이 없으면 전체를 하나의 블록으로 처리
  if (verifierBlocks.length === 0) {
    verifierBlocks.push(cleanedResult.trim());
  }
  
  const verifierCards = [];

  verifierBlocks.forEach((block) => {
    const lines = block.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return;

    // 첫 줄에서 [Verifier 이름] 점수: X 파싱
    const headerMatch = lines[0].match(/\[([^\]]+)\]\s*점수:\s*([0-9.]+|N\/A)/);
    if (!headerMatch) {
      // 파싱 실패 시 원본 텍스트 표시
      verifierCards.push(`
        <div style="margin-bottom: 10px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #6c757d;">
          <div style="color: #495057; font-size: 0.9em; line-height: 1.5;">
            ${block}
          </div>
        </div>
      `);
      return;
    }

    const verifierName = headerMatch[1].trim();
    const score = headerMatch[2].trim();
    const scoreNum = score === "N/A" ? null : parseFloat(score);
    const isValid = scoreNum !== null && scoreNum >= 3;
    const scoreColor = scoreNum === null ? "#6c757d" : isValid ? "#28a745" : "#dc3545";
    const scoreBg = scoreNum === null ? "#f8f9fa" : isValid ? "#d4edda" : "#f8d7da";

    // [평가 요약]과 [개선 제안] 추출
    let evaluationSummary = "";
    let improvementSuggestions = "";
    let feedback = ""; // 하위 호환성

    const fullText = block; // 전체 블록 텍스트 사용
    
    // [평가 요약] 섹션 추출
    // 형식: [평가 요약]\n내용\n[개선 제안] 또는 [평가 요약]\n내용\n[다음 verifier]
    const evalIndex = fullText.indexOf("[평가 요약]");
    const improveIndex = fullText.indexOf("[개선 제안]");
    
    if (evalIndex !== -1) {
      const startIndex = evalIndex + "[평가 요약]".length;
      const endIndex = improveIndex !== -1 ? improveIndex : fullText.length;
      evaluationSummary = fullText.substring(startIndex, endIndex).replace(/^\s*\n+|\n+$/g, "").trim();
    }
    
    // [개선 제안] 섹션 추출
    // 형식: [개선 제안]\n내용\n[다음 verifier] 또는 [개선 제안]\n내용 (끝)
    if (improveIndex !== -1) {
      const startIndex = improveIndex + "[개선 제안]".length;
      // 다음 verifier 블록 시작 찾기 (다음 줄에 [로 시작하는 패턴)
      const nextVerifierMatch = fullText.substring(startIndex).match(/\n\[[^\]]+\]\s*점수:/);
      const endIndex = nextVerifierMatch ? startIndex + nextVerifierMatch.index : fullText.length;
      improvementSuggestions = fullText.substring(startIndex, endIndex).replace(/^\s*\n+|\n+$/g, "").trim();
    }

    // 하위 호환성: [평가 요약]/[개선 제안]이 없으면 기존 형식 파싱
    if (!evaluationSummary && !improvementSuggestions) {
      const oldMatch = lines[0].match(/\[([^\]]+)\]\s*점수:\s*([0-9.]+|N\/A),?\s*(.+)/);
      if (oldMatch) {
        feedback = oldMatch[3].trim();
      }
    }

    verifierCards.push(`
        <div style="margin-bottom: 12px; padding: 14px; background: ${scoreBg}; border-radius: 8px; border-left: 4px solid ${scoreColor};">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <strong style="color: #495057; font-size: 0.95em;">${verifierName}</strong>
            <span style="background: ${scoreColor}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">
              ${scoreNum !== null ? `${scoreNum}점` : "N/A"}
            </span>
          </div>
          ${
            evaluationSummary
              ? `
          <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px; ">
            <div style="font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.9em;"> 평가 요약</div>
            <div style="color: #495057; font-size: 0.9em; line-height: 1.6;">${evaluationSummary}</div>
          </div>
          `
              : ""
          }
          ${
            improvementSuggestions
              ? `
          <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px; ">
            <div style="font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.9em;"> 개선 제안</div>
            <div style="color: #495057; font-size: 0.9em; line-height: 1.6;">${improvementSuggestions}</div>
          </div>
          `
              : ""
          }
          ${
            feedback && !evaluationSummary && !improvementSuggestions
              ? `
          <div style="color: #495057; font-size: 0.9em; line-height: 1.5; margin-top: 6px;">
            ${feedback}
          </div>
          `
              : ""
          }
        </div>
      `);
  });

  if (verifierCards.length === 0) {
    return "";
  }

  // 고유 ID 생성
  const toggleId = `verification-result-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  return `
    <div style="margin-top: 12px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #dee2e6;">
      <div style="font-weight: 600; color: #495057; margin-bottom: 12px; font-size: 0.95em; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" 
           onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.toggle-icon').textContent = this.nextElementSibling.style.display === 'none' ? '▶' : '▼';">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.2em;">🔍</span>
          <span>검증 결과</span>
        </div>
        <span class="toggle-icon" style="font-size: 0.8em; color: #6c757d;">▶</span>
      </div>
      <div id="${toggleId}" style="display: none;">
        ${verifierCards.join("")}
      </div>
    </div>
  `;
}

// 문제 정보 섹션 업데이트 함수