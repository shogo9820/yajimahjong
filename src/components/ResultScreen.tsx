import React from "react";
import { ResultRow } from "../types";

interface ResultScreenProps {
  resultRows: ResultRow[];
  onOpenLogModal: () => void;
  onOpenStatsModal: () => void;
  onNextGame: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
  resultRows,
  onOpenLogModal,
  onOpenStatsModal,
  onNextGame,
}) => {
  return (
    <div id="screen-result" className="screen">
      <div className="result-title-section text-center">
        <h1 className="title">対局結果 (精算)</h1>
        <p className="subtitle">ウマオカ自動計算</p>
      </div>

      <div className="result-content-body">
        <div
          className="result-table-block card"
          style={{ padding: 0, backgroundColor: "#1e293b" }}
        >
          <table className="result-table">
            <thead>
              <tr>
                <th>着順</th>
                <th>名前</th>
                <th className="text-right">素点</th>
                <th className="text-right">ポイント</th>
              </tr>
            </thead>
            <tbody id="result-table-body">
              {resultRows.map((row) => {
                const ptClass = row.pt >= 0 ? "pt-plus" : "pt-minus";
                const ptSign = row.pt > 0 ? "+" : "";
                return (
                  <tr key={row.rank}>
                    <td>
                      <strong>{row.rank}位</strong>
                    </td>
                    <td>{row.name}</td>
                    <td className="text-right font-mono">
                      {row.score.toLocaleString()}
                    </td>
                    <td className={`text-right font-mono ${ptClass}`}>
                      {ptSign}
                      {row.pt.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="result-buttons-block">
          <button
            type="button"
            onClick={onOpenLogModal}
            className="btn btn-dark"
          >
            📜 この半荘の全ログを確認
          </button>
          <button
            type="button"
            onClick={onOpenStatsModal}
            className="btn btn-sky"
          >
            📊 総合成績表を見る
          </button>
          <button
            type="button"
            onClick={onNextGame}
            className="btn btn-emerald"
          >
            次の半荘を開始
          </button>
        </div>
      </div>
    </div>
  );
};

