import { useState, useEffect } from "react";
import { api } from "../../services/api";
import styles from "./AdminDbView.module.css";

interface HistorySummary {
  problem_id: string;
  timestamp: string;
  has_cot: boolean;
  has_subq: boolean;
  has_guideline: boolean;
  filename?: string;
}

interface SavedResultDetail {
  problemId: string;
  timestamp?: string;
  guidelineData?: { guide_sub_questions?: any[]; subject_area?: string };
  rubrics?: any[];
  cotData?: any;
}

interface AdminDbViewProps {
  onClose: () => void;
}

export const AdminDbView = ({ onClose }: AdminDbViewProps) => {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [list, setList] = useState<HistorySummary[]>([]);
  const [detail, setDetail] = useState<SavedResultDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const res = await api.getAdminUsers();
        if (!cancelled) setUserIds(res.user_ids || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "사용자 목록 조회 실패");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedUser) {
      setList([]);
      setDetail(null);
      return;
    }
    let cancelled = false;
    setError(null);
    setLoading(true);
    setDetail(null);
    (async () => {
      try {
        const data = await api.getHistoryListForUser(selectedUser);
        if (!cancelled) setList(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "목록 조회 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedUser]);

  const loadDetail = async (problemId: string) => {
    if (!selectedUser) return;
    setError(null);
    setLoading(true);
    try {
      const data = await api.getResultForUser(problemId, selectedUser);
      setDetail(data || null);
    } catch (e: any) {
      setError(e.message || "상세 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const subQuestions = detail?.guidelineData?.guide_sub_questions ?? [];
  const rubrics = detail?.rubrics ?? [];

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>저장 결과 보기 (관리자)</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            닫기
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.toolbar}>
          <label>
            사용자
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className={styles.select}
            >
              <option value="">선택</option>
              {userIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.body}>
          <div className={styles.listPanel}>
            <h3>저장된 결과 ({selectedUser || "-"})</h3>
            {loading && !list.length ? (
              <p className={styles.muted}>불러오는 중…</p>
            ) : list.length === 0 ? (
              <p className={styles.muted}>{selectedUser ? "저장된 결과가 없습니다." : "사용자를 선택하세요."}</p>
            ) : (
              <ul className={styles.resultList}>
                {list.map((item) => (
                  <li
                    key={item.problem_id}
                    className={styles.resultItem}
                    onClick={() => loadDetail(item.problem_id)}
                  >
                    <span className={styles.problemId}>{item.problem_id}</span>
                    <span className={styles.meta}>
                      {item.timestamp ? new Date(item.timestamp).toLocaleString("ko-KR") : ""}
                      {item.has_guideline && " · Guideline"}
                      {item.has_subq && " · SubQ"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.detailPanel}>
            <h3>하위문항 · 루브릭</h3>
            {loading && !detail ? (
              <p className={styles.muted}>불러오는 중…</p>
            ) : !detail ? (
              <p className={styles.muted}>항목을 선택하면 여기에 하위문항과 루브릭이 표시됩니다.</p>
            ) : (
              <>
                {subQuestions.length > 0 && (
                  <section className={styles.section}>
                    <h4>하위문항 (확정)</h4>
                    <div className={styles.subList}>
                      {subQuestions.map((sq: any, i: number) => (
                        <div key={sq.sub_question_id || i} className={styles.subCard}>
                          <div className={styles.subId}>{sq.sub_question_id ?? sq.step_id ?? i + 1}</div>
                          <div className={styles.subQ}>{sq.guide_sub_question || "(없음)"}</div>
                          {sq.guide_sub_answer && (
                            <div className={styles.subA}><strong>정답:</strong> {sq.guide_sub_answer}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {rubrics.length > 0 && (
                  <section className={styles.section}>
                    <h4>루브릭</h4>
                    <div className={styles.rubricList}>
                      {rubrics.map((r: any, i: number) => (
                        <div key={r.sub_question_id || i} className={styles.rubricCard}>
                          <div className={styles.rubricTitle}>
                            {r.sub_question_id} · {r.step_name || ""} {r.sub_skill_name ? `- ${r.sub_skill_name}` : ""}
                          </div>
                          <div className={styles.rubricQuestion}>{r.question || ""}</div>
                          {r.levels?.length > 0 && (
                            <ul className={styles.levelList}>
                              {r.levels.map((lv: any) => (
                                <li key={lv.level} className={styles.levelItem}>
                                  <strong>{lv.level}</strong>: {lv.description || lv.title || ""}
                                  {lv.bullets?.length > 0 && (
                                    <ul>
                                      {lv.bullets.slice(0, 3).map((b: string, j: number) => (
                                        <li key={j}>{b}</li>
                                      ))}
                                      {lv.bullets.length > 3 && <li>…외 {lv.bullets.length - 3}개</li>}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                {detail && !subQuestions.length && !rubrics.length && (
                  <p className={styles.muted}>이 항목에는 하위문항/루브릭 데이터가 없습니다.</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
