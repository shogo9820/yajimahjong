import React, { useEffect, useRef } from "react";
import { MatchLog, Room, TransferModalData } from "../types";

interface StatsModalProps {
  isOpen: boolean;
  roomName: string;
  room: Room | undefined;
  onClose: () => void;
}

export const StatsModal: React.FC<StatsModalProps> = ({
  isOpen,
  roomName,
  room,
  onClose,
}) => {
  if (!isOpen) return null;

  const playersObj = room?.players || {};
  const sortedStats = Object.keys(playersObj)
    .map((pId) => {
      const p = playersObj[Number(pId)];
      return {
        id: p.id,
        name: p.name,
        pt: p.points || 0,
        games: p.totalGames || 0,
      };
    })
    .sort((a, b) => b.pt - a.pt);

  return (
    <div id="screen-stats" className="full-modal">
      <div className="full-modal-inner">
        <div className="modal-top-header text-center border-bottom">
          <h1 className="title">総合成績表</h1>
          <p className="subtitle">現在のルーム: {roomName}</p>
        </div>

        <div className="modal-scroll-area">
          <table className="result-table">
            <thead>
              <tr>
                <th>プレイヤー</th>
                <th className="text-center">対局数</th>
                <th className="text-right">トータルポイント</th>
              </tr>
            </thead>
            <tbody id="stats-table-body">
              {sortedStats.map((item) => {
                const ptClass = item.pt >= 0 ? "pt-plus" : "pt-minus";
                const ptSign = item.pt > 0 ? "+" : "";
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>{" "}
                      <span style={{ fontSize: "10px", color: "#64748b" }}>
                        (ID:{item.id})
                      </span>
                    </td>
                    <td className="text-center font-mono">{item.games}</td>
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

        <div className="modal-bottom-footer">
          <button type="button" onClick={onClose} className="btn btn-dark">
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
  onClose: () => void;
}

export const LogModal: React.FC<LogModalProps> = ({
  isOpen,
  matchLogs,
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

        <div className="modal-bottom-footer">
          <button type="button" onClick={onClose} className="btn btn-dark">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

interface TransferResultModalProps {
  data: TransferModalData;
  onConfirmNext: () => void;
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

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-emerald"
            onClick={onConfirmNext}
          >
            {data.isTobiEnd ? "終局・精算画面へ" : "次局へ進む"}
          </button>
        </div>
      </div>
    </div>
  );
};

