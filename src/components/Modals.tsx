import React, { useEffect, useRef } from "react";
import { MatchLog, Room, TransferModalData } from "../types";

interface StatsModalProps {
  isOpen: boolean;
  roomName: string;
  room: Room | undefined;
  onUndoLastMatchStats: () => void;
  onClose: () => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  roomName,
  room,
  onUndoLastMatchStats,
  onClose,
}) => {
  if (!isOpen) return null;

  const playersObj = room?.players || {};
  const hasHistory =
    Array.isArray(room?.matchHistory) && room!.matchHistory!.length > 0;

  const sortedStats = Object.keys(playersObj)
    .map((pId) => {
      const p = playersObj[Number(pId)];
      const rc = p.rankCounts || [0, 0, 0, 0];
      const totalRankedGames = rc[0] + rc[1] + rc[2] + rc[3];
      const weightedSum = rc[0] * 1 + rc[1] * 2 + rc[2] * 3 + rc[3] * 4;
      const avgRank =
        totalRankedGames > 0
          ? (weightedSum / totalRankedGames).toFixed(2)
          : "-";

      return {
        id: p.id,
        name: p.name,
        pt: p.points || 0,
        games: p.totalGames || 0,
        rankCounts: rc,
        avgRank,
      };
    })
    .sort((a, b) => b.pt - a.pt);

  return (
    <div id="screen-stats" className="full-modal">
      <div className="full-modal-inner">
        <div className="modal-top-header text-center border-bottom">
          <h1 className="title">総合成績表</h1>
          <p className="subtitle">
            現在のルーム: {roomName}（通算 {room?.gameCount || 0} 半荘）
          </p>
        </div>

        <div className="modal-scroll-area">
          <table className="result-table stats-detail-table">
            <thead>
              <tr>
                <th>プレイヤー</th>
                <th className="text-center">対局</th>
                <th className="text-center">平均着順</th>
                <th className="text-center">着順内訳(1-2-3-4)</th>
                <th className="text-right">トータルpt</th>
              </tr>
            </thead>
            <tbody id="stats-table-body">
              {sortedStats.map((item, idx) => {
                const ptClass = item.pt >= 0 ? "pt-plus" : "pt-minus";
                const ptSign = item.pt > 0 ? "+" : "";
                return (
                  <tr key={item.id}>
                    <td>
                      <span className="stats-rank-num">{idx + 1}.</span>{" "}
                      <strong>{item.name}</strong>
                    </td>
                    <td className="text-center font-mono">{item.games}</td>
                    <td className="text-center font-mono">{item.avgRank}</td>
                    <td
                      className="text-center font-mono"
                      style={{ fontSize: "12px", color: "#94a3b8" }}
                    >
                      {item.rankCounts.join("-")}
                    </td>
                    <td className={`text-right font-mono ${ptClass}`}>
                      {ptSign}
                      {item.pt.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="modal-bottom-footer flex gap-2">
          {hasHistory && (
            <button
              type="button"
              onClick={onUndoLastMatchStats}
              className="btn btn-rose"
              style={{ flex: 0.8, fontSize: "13px" }}
            >
              ↩ 直前の半荘成績を取消
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-dark"
            style={{ flex: 1 }}
          >
            成績表を閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

interface LogModalProps {
  isOpen: boolean;
  matchLogs: MatchLog[];
  canUndo: boolean;
  onUndoLastRound: () => void;
  onClose: () => void;
}

export const LogModal: React.FC<LogModalProps> = ({
  isOpen,
  matchLogs,
  canUndo,
  onUndoLastRound,
  onClose,
}) => {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [isOpen, matchLogs]);

  if (!isOpen) return null;

  return (
    <div
      id="common-log-modal"
      className="full-modal"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.96)", zIndex: 100 }}
    >
      <div className="full-modal-inner">
        <div className="modal-top-header text-center border-bottom">
          <h2 className="title" style={{ fontSize: "18px" }}>
            🀄 対局精算ログ履歴
          </h2>
        </div>

        <div
          id="modal-log-list-area"
          ref={listRef}
          className="modal-scroll-area"
        >
          {!matchLogs || matchLogs.length === 0 ? (
            <div
              style={{
                color: "#64748b",
                textAlign: "center",
                paddingTop: "40px",
                fontSize: "14px",
              }}
            >
              まだこの半荘の精算履歴はありません。
            </div>
          ) : (
            matchLogs.map((log, idx) => (
              <div key={idx} className="log-block">
                <div className="log-title-row">{log.title}</div>
                {log.rows.map((r, rIdx) => {
                  const ptClass = r.pt >= 0 ? "log-pt-plus" : "log-pt-minus";
                  const ptSign = r.pt > 0 ? "+" : "";
                  return (
                    <div key={rIdx} className="log-action-row">
                      <span
                        className="log-action-type"
                        style={{
                          color: r.type === "放銃　　" ? "#94a3b8" : "#cbd5e1",
                        }}
                      >
                        {r.type}
                      </span>
                      <span className="log-player-name">{r.name}</span>
                      <span className={ptClass}>
                        {ptSign}
                        {r.pt.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
                {log.isTobiEnd && (
                  <div className="log-status-tobi">
                    🚨 ぶっ飛び：{log.tobiPlayer}のマイナスによりコールド終局
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="modal-bottom-footer flex gap-2">
          {canUndo && (
            <button
              type="button"
              onClick={onUndoLastRound}
              className="btn btn-amber"
              style={{ flex: 0.85, fontSize: "13px" }}
            >
              ↩ 直前の1局をやり直す
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-dark"
            style={{ flex: 1 }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

interface TransferResultModalProps {
  data: TransferModalData;
  onConfirmNext: (forceEndMatch?: boolean) => void;
}

export const TransferResultModal: React.FC<TransferResultModalProps> = ({
  data,
  onConfirmNext,
}) => {
  if (!data.isOpen) return null;

  return (
    <div id="transfer-result-modal" className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <span id="transfer-modal-title" className="modal-title">
            {data.title}
          </span>
        </div>

        <div id="transfer-modal-subtitle" className="transfer-subtitle">
          {data.subtitle}
        </div>

        <div id="transfer-modal-list" className="transfer-list">
          {data.diffList.map((item, idx) => {
            let ptClass = "transfer-pt-zero";
            let ptSign = "";
            if (item.diff > 0) {
              ptClass = "transfer-pt-plus";
              ptSign = "+";
            } else if (item.diff < 0) {
              ptClass = "transfer-pt-minus";
            }
            return (
              <div key={idx} className="transfer-row">
                <span className="transfer-player-name">{item.name}</span>
                <span className={ptClass}>
                  {ptSign}
                  {item.diff.toLocaleString()} 点
                </span>
              </div>
            );
          })}
        </div>

        {data.extraInfo && (
          <div
            id="transfer-modal-extra"
            className="transfer-extra-info"
            dangerouslySetInnerHTML={{ __html: data.extraInfo }}
          />
        )}

        <div className="modal-footer flex flex-col gap-1">
          {data.isTobiEnd ? (
            <button
              type="button"
              className="btn btn-rose"
              onClick={() => onConfirmNext(true)}
            >
              🚨 コールド終局・精算画面へ
            </button>
          ) : data.isAllLastEnd ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-dark-sub"
                style={{ flex: 0.75 }}
                onClick={() => onConfirmNext(false)}
              >
                延長戦(西入/南入)へ
              </button>
              <button
                type="button"
                className="btn btn-amber"
                style={{ flex: 1.25 }}
                onClick={() => onConfirmNext(true)}
              >
                🏆 オーラス終局・精算へ
              </button>
            </div>
          ) : data.canAgariYame ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-emerald"
                style={{ flex: 1 }}
                onClick={() => onConfirmNext(false)}
              >
                連荘して次局へ
              </button>
              <button
                type="button"
                className="btn btn-amber"
                style={{ flex: 1.15 }}
                onClick={() => onConfirmNext(true)}
              >
                🏆 アガリ/聴牌止めで終局
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-emerald"
              onClick={() => onConfirmNext(false)}
            >
              {data.isSameKyokuRetry ? "同局やり直しへ進む" : "次局へ進む"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
