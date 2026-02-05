export const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const formatAnswer = (answer) => {
  if (!answer) return '';
  answer = answer.trim();
  if (/^\\+$/.test(answer)) return '';
  answer = answer.replace(/(^|\s)\\(\s|$)/g, '$1$2').trim();
  if (!answer) return '';
  answer = answer.replace(/\n/g, '<br>');
  return answer.replace(/(=\s*\d+)\s+(?=\d)/g, '$1<br>');
};

export const formatQuestion = (question) => {
  if (!question) return '';
  question = question.trim();
  if (/^\\+$/.test(question)) return '';
  question = question.replace(/(^|\s)\\(\s|$)/g, '$1$2').trim();
  return question || '';
};

export const formatVerificationResult = (verificationResult) => {
  if (!verificationResult || !verificationResult.trim()) return '';

  let cleanedResult = verificationResult.trim();
  if (cleanedResult.startsWith('"') && cleanedResult.endsWith('"')) {
    cleanedResult = cleanedResult.slice(1, -1);
  }

  const lines = cleanedResult.split(/\n/);
  const verifierBlocks = [];
  let currentBlock = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.match(/^\[[^\]]+\]\s*점수:/)) {
      if (currentBlock.trim()) {
        verifierBlocks.push(currentBlock.trim());
      }
      currentBlock = line;
    } else if (currentBlock) {
      currentBlock += '\n' + line;
    } else {
      currentBlock = line;
    }
  }

  if (currentBlock.trim()) {
    verifierBlocks.push(currentBlock.trim());
  }

  if (verifierBlocks.length === 0) {
    verifierBlocks.push(cleanedResult.trim());
  }

  const verifierCards = [];

  verifierBlocks.forEach((block) => {
    const lines = block.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return;

    const headerMatch = lines[0].match(/\[([^\]]+)\]\s*점수:\s*([0-9.]+|N\/A)/);
    if (!headerMatch) {
      verifierCards.push(
        `<div style="margin-bottom: 10px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #6c757d;">
          <div style="color: #495057; font-size: 0.9em; line-height: 1.5;">
            ${block}
          </div>
        </div>`
      );
      return;
    }

    const verifierName = headerMatch[1].trim();
    const score = headerMatch[2].trim();
    const scoreNum = score === 'N/A' ? null : parseFloat(score);
    const isValid = scoreNum !== null && scoreNum >= 3;
    const scoreColor = scoreNum === null ? '#6c757d' : isValid ? '#28a745' : '#dc3545';
    const scoreBg = scoreNum === null ? '#f8f9fa' : isValid ? '#d4edda' : '#f8d7da';

    const fullText = block;
    const evalIndex = fullText.indexOf('[평가 요약]');
    const improveIndex = fullText.indexOf('[개선 제안]');

    let evaluationSummary = '';
    let improvementSuggestions = '';

    if (evalIndex !== -1) {
      const startIndex = evalIndex + '[평가 요약]'.length;
      const endIndex = improveIndex !== -1 ? improveIndex : fullText.length;
      evaluationSummary = fullText.substring(startIndex, endIndex).replace(/^\s*\n+|\n+$/g, '').trim();
    }

    if (improveIndex !== -1) {
      const startIndex = improveIndex + '[개선 제안]'.length;
      const nextVerifierMatch = fullText.substring(startIndex).match(/\n\[[^\]]+\]\s*점수:/);
      const endIndex = nextVerifierMatch ? startIndex + nextVerifierMatch.index : fullText.length;
      improvementSuggestions = fullText.substring(startIndex, endIndex).replace(/^\s*\n+|\n+$/g, '').trim();
    }

    verifierCards.push(`
      <div style="margin-bottom: 12px; padding: 14px; background: ${scoreBg}; border-radius: 8px; border-left: 4px solid ${scoreColor};">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
          <strong style="color: #495057; font-size: 0.95em;">${verifierName}</strong>
          <span style="background: ${scoreColor}; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.85em; font-weight: 600;">
            ${scoreNum !== null ? `${scoreNum}점` : 'N/A'}
          </span>
        </div>
        ${
          evaluationSummary
            ? `
        <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.9em;">평가 요약</div>
          <div style="color: #495057; font-size: 0.9em; line-height: 1.6;">${evaluationSummary}</div>
        </div>
        `
            : ''
        }
        ${
          improvementSuggestions
            ? `
        <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 6px;">
          <div style="font-weight: 600; color: #495057; margin-bottom: 6px; font-size: 0.9em;">개선 제안</div>
          <div style="color: #495057; font-size: 0.9em; line-height: 1.6;">${improvementSuggestions}</div>
        </div>
        `
            : ''
        }
      </div>
    `);
  });

  if (verifierCards.length === 0) {
    return '';
  }

  // 토글 기능 제거 - React 컴포넌트에서 토글 처리
  return verifierCards.join('');
};
