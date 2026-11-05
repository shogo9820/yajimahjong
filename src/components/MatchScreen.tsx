import React, { useEffect, useRef, useState } from "react";
import {
  AgariType,
  CustomRules,
  DiceState,
  ManganScale,
  MatchCalcState,
  WIND_LABELS,
  WinnerHandConfig,
} from "../types";
import { calcHandPoints, formatHandShortLabel } from "../utils/scoreCalc";

interface MatchScreenProps {
  activePlayers: number[];
  subPlayer: number | null;
  currentPoints: Record<number, number>;
  tableSize: number;
  currentWind: number;
  currentKyoku: number;
  honbaCount: number;
  kyotakuCount: number;
  riichiPlayers: number[];
  rules: CustomRules;
  dice: DiceState;
  matchCalc: MatchCalcState;
  canUndo: boolean;
  getPlayerName: (id: number) => string;
  onRollDice: () => void;
  onToggleRiichi: (playerId: number) => void;
  onManualScoreChange: (playerId: number, score: number) => void;
  onUpdateMatchCalc: (partial: Partial<MatchCalcState>) => void;
  onClearRoleSlots: () => void;
  onExecutePointTransfer: () => void;
  onExecuteAbortiveDraw: (isRenchan: boolean) => void;
  onExecuteChombo: () => void;
  onUndoLastRound: () => void;
  onOpenLogModal: () => void;
  onEndMatch: () => void;
}

const LANDSCAPE_SEAT_CONFIG = [
  { id: "ls-seat-bottom", className: "table-seat seat-bottom" },
  { id: "ls-seat-right", className: "table-seat seat-right" },
  { id: "ls-seat-top", className: "table-seat seat-top" },
  { id: "ls-seat-left", className: "table-seat seat-left" },
] as const;

export const MatchScreen: React.FC<MatchScreenProps> = ({
  activePlayers,
  subPlayer,
  currentPoints,
  tableSize,
  currentWind,
  currentKyoku,
  honbaCount,
  kyotakuCount,
  riichiPlayers,
  rules,
  dice,
  matchCalc,
  canUndo,
  getPlayerName,
  onRollDice,
  onToggleRiichi,
  onManualScoreChange,
  onUpdateMatchCalc,
  onClearRoleSlots,
  onExecutePointTransfer,
  onExecuteAbortiveDraw,
  onExecuteChombo,
  onUndoLastRound,
  onOpenLogModal,
  onEndMatch,
}) => {
  const [dragOverTarget, setDragOverTarget] = useState<
    "winner" | "loser" | null
  >(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
  const [touchGhost, setTouchGhost] = useState<{
    playerId: number;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const touchMovedRef = useRef(false);

  // 🎯 点数タップ時の「3秒間 他プレイヤーとの点差表示」用State
  const [diffBasePlayerId, setDiffBasePlayerId] = useState<number | null>(null);
  const diffTimerRef = useRef<number | null>(null);

  // 🎯 ダブロン時にどの和了者の手役（符・翻・満貫）を編集しているか
  const [editingWinnerId, setEditingWinnerId] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (diffTimerRef.current !== null) {
        window.clearTimeout(diffTimerRef.current);
      }
    };
  }, []);

  // 和了者リストが変わった際、ダブロン編集対象IDを自動調整
  useEffect(() => {
    if (matchCalc.winners.length === 0) {
      setEditingWinnerId(null);
    } else if (
      editingWinnerId === null ||
      !matchCalc.winners.includes(editingWinnerId)
    ) {
      setEditingWinnerId(matchCalc.winners[matchCalc.winners.length - 1]);
    }
  }, [matchCalc.winners, editingWinnerId]);

  const oyaWind = WIND_LABELS[currentWind] || "東";
  const roundStr = `${oyaWind}${currentKyoku}局`;
  const oyaIndex = (currentKyoku - 1) % tableSize;
  const currentOyaId = activePlayers[oyaIndex];
  const isSanma = tableSize === 3;
  const is43Mode = rules.gameMode === "4-3打ち";

  const startPoints = parseInt(rules.points.split("-")[0], 10) || 25000;

  // プレイヤーごとの手役設定を取得するヘルパー
  const getWinnerConfig = (pId: number): WinnerHandConfig => {
    if (matchCalc.winnerConfigs && matchCalc.winnerConfigs[pId]) {
      return matchCalc.winnerConfigs[pId];
    }
    return {
      fu: matchCalc.fu,
      han: matchCalc.han,
      scale: matchCalc.scale,
    };
  };

  // 現在操作中の手役設定（シングル和了時は共通設定、ダブロン時は選択中の和了者設定）
  const activeHandConfig: WinnerHandConfig =
    matchCalc.type === "ron" &&
    matchCalc.winners.length >= 2 &&
    editingWinnerId !== null
      ? getWinnerConfig(editingWinnerId)
      : {
          fu: matchCalc.fu,
          han: matchCalc.han,
          scale: matchCalc.scale,
        };

  const updateActiveHandConfig = (partial: Partial<WinnerHandConfig>) => {
    if (
      matchCalc.type === "ron" &&
      matchCalc.winners.length >= 2 &&
      editingWinnerId !== null
    ) {
      const prevCfg = getWinnerConfig(editingWinnerId);
      const nextCfg = { ...prevCfg, ...partial };
      const nextMap = {
        ...(matchCalc.winnerConfigs || {}),
        [editingWinnerId]: nextCfg,
      };
      // 1人目の場合は基本fu/han/scaleも同期しておく
      if (editingWinnerId === matchCalc.winners[0]) {
        onUpdateMatchCalc({
          ...partial,
          winnerConfigs: nextMap,
        });
      } else {
        onUpdateMatchCalc({
          winnerConfigs: nextMap,
        });
      }
    } else {
      const nextMap = { ...(matchCalc.winnerConfigs || {}) };
      if (matchCalc.winners.length === 1) {
        const wId = matchCalc.winners[0];
        nextMap[wId] = { ...getWinnerConfig(wId), ...partial };
      }
      onUpdateMatchCalc({
        ...partial,
        winnerConfigs: nextMap,
      });
    }
  };

  // 点数を押した時に3秒間だけ他プレイヤーとの点差を表示する
  const handleScoreBoxClick = (playerId: number) => {
    if (diffTimerRef.current !== null) {
      window.clearTimeout(diffTimerRef.current);
    }
    setDiffBasePlayerId(playerId);
    diffTimerRef.current = window.setTimeout(() => {
      setDiffBasePlayerId(null);
      diffTimerRef.current = null;
    }, 3000);
  };

  const handleScoreManualEditPrompt = (
    e: React.MouseEvent,
    playerId: number,
    currentScore: number
  ) => {
    e.stopPropagation();
    const input = window.prompt(
      `${getPlayerName(playerId)} の持ち点を直接修正:`,
      String(currentScore)
    );
    if (input !== null) {
      const parsed = parseInt(input, 10);
      if (!Number.isNaN(parsed)) {
        onManualScoreChange(playerId, parsed);
      }
    }
  };

  // 点数または点差の表示文字列・クラスを算出
  const getScoreDisplayInfo = (playerId: number, rawScore: number) => {
    if (diffBasePlayerId === null) {
      return {
        text: rawScore.toLocaleString(),
        mode: "normal" as const,
      };
    }
    if (playerId === diffBasePlayerId) {
      return {
        text: `基準 ${rawScore.toLocaleString()}`,
        mode: "base" as const,
      };
    }
    const baseScore = currentPoints[diffBasePlayerId] ?? startPoints;
    const diff = rawScore - baseScore;
    const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
    return {
      text: `${sign}${diff.toLocaleString()}`,
      mode: diff > 0 ? ("plus" as const) : diff < 0 ? ("minus" as const) : ("zero" as const),
    };
  };

  const assignToRole = (
    playerId: number,
    role: "winner" | "loser",
    toggleIfExist = false
  ) => {
    if (role === "winner") {
      if (matchCalc.type === "tenpai") {
        const exists = matchCalc.winners.includes(playerId);
        if (exists) {
          if (toggleIfExist && !riichiPlayers.includes(playerId)) {
            onUpdateMatchCalc({
              winners: matchCalc.winners.filter((id) => id !== playerId),
            });
          }
        } else {
          onUpdateMatchCalc({ winners: [...matchCalc.winners, playerId] });
        }
      } else if (matchCalc.type === "ron") {
        const exists = matchCalc.winners.includes(playerId);
        if (exists) {
          if (toggleIfExist) {
            onUpdateMatchCalc({
              winners: matchCalc.winners.filter((id) => id !== playerId),
            });
          }
        } else {
          const maxWinners = Math.max(1, tableSize - 1);
          const filtered = matchCalc.winners.slice(0, maxWinners - 1);
          const nextWinners = [...filtered, playerId];
          const nextLoser =
            matchCalc.loser === playerId ? null : matchCalc.loser;
          const nextConfigs = { ...(matchCalc.winnerConfigs || {}) };
          if (filtered.length >= 1 && !nextConfigs[filtered[0]]) {
            nextConfigs[filtered[0]] = {
              fu: matchCalc.fu,
              han: matchCalc.han,
              scale: matchCalc.scale,
            };
          }
          if (!nextConfigs[playerId]) {
            nextConfigs[playerId] = {
              fu: matchCalc.fu,
              han: matchCalc.han,
              scale: matchCalc.scale,
            };
          }
          setEditingWinnerId(playerId);
          onUpdateMatchCalc({
            winners: nextWinners,
            loser: nextLoser,
            winnerConfigs: nextConfigs,
          });
        }
      } else {
        onUpdateMatchCalc({ winners: [playerId] });
      }
    } else {
      if (matchCalc.type === "tenpai" || matchCalc.type === "special") return;
      const nextWinners = matchCalc.winners.filter((id) => id !== playerId);
      onUpdateMatchCalc({ loser: playerId, winners: nextWinners });
    }
  };

  const handlePlayerChipTap = (playerId: number) => {
    if (touchMovedRef.current) return;
    if (matchCalc.type === "tenpai") {
      assignToRole(playerId, "winner", true);
    } else if (matchCalc.type === "tsumo" || matchCalc.type === "special") {
      assignToRole(playerId, "winner", true);
    } else {
      if (matchCalc.winners.includes(playerId)) {
        onUpdateMatchCalc({
          winners: matchCalc.winners.filter((id) => id !== playerId),
        });
      } else if (matchCalc.loser === playerId) {
        onUpdateMatchCalc({ loser: null });
      } else if (matchCalc.winners.length === 0) {
        assignToRole(playerId, "winner");
      } else if (matchCalc.loser === null) {
        onUpdateMatchCalc({ loser: playerId });
      } else {
        assignToRole(playerId, "winner");
      }
    }
  };

  const handleSetAgariType = (type: AgariType) => {
    onUpdateMatchCalc({
      type,
      winners: type === "tenpai" ? [...riichiPlayers] : [],
      loser: null,
      scale: null,
      winnerConfigs: {},
    });
  };

  const handleToggleScale = (scale: Exclude<ManganScale, null>) => {
    updateActiveHandConfig({
      scale: activeHandConfig.scale === scale ? null : scale,
    });
  };

  // Touch Drag & Drop
  const handleTouchStart = (e: React.TouchEvent, playerId: number) => {
    touchMovedRef.current = false;
    const touch = e.touches[0];
    setDraggingPlayerId(playerId);
    setTouchGhost({
      playerId,
      name: getPlayerName(playerId),
      x: touch.clientX,
      y: touch.clientY,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggingPlayerId === null) return;
    touchMovedRef.current = true;
    const touch = e.touches[0];
    setTouchGhost((prev) =>
      prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null
    );

    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetEl) {
      setDragOverTarget(null);
      return;
    }
    if (targetEl.closest(".winner-target")) {
      setDragOverTarget("winner");
    } else if (
      targetEl.closest(".loser-target") &&
      matchCalc.type !== "tenpai" &&
      matchCalc.type !== "special"
    ) {
      setDragOverTarget("loser");
    } else {
      setDragOverTarget(null);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, playerId: number) => {
    if (touchMovedRef.current) {
      const touch = e.changedTouches[0];
      const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
      if (targetEl) {
        if (targetEl.closest(".winner-target")) {
          assignToRole(playerId, "winner");
        } else if (
          targetEl.closest(".loser-target") &&
          matchCalc.type !== "tenpai" &&
          matchCalc.type !== "special"
        ) {
          assignToRole(playerId, "loser");
        }
      }
    }
    setDraggingPlayerId(null);
    setDragOverTarget(null);
    setTouchGhost(null);
    setTimeout(() => {
      touchMovedRef.current = false;
    }, 50);
  };

  const isTenpai = matchCalc.type === "tenpai";
  const isTsumo = matchCalc.type === "tsumo";
  const isSpecial = matchCalc.type === "special";
  const isDoubleRon =
    matchCalc.type === "ron" && matchCalc.winners.length >= 2;

  const winnerLabelText = isSpecial
    ? "🚨 チョンボ者 (錯和のみ)"
    : isTenpai
    ? "⭕ 聴牌者 (他はノーテン)"
    : isDoubleRon
    ? `🏆 和了者 (ダブロン ${matchCalc.winners.length}名)`
    : "🏆 和了者 (ダブロン可)";

  const loserLabelText =
    isTenpai || isSpecial
      ? "❌ （不使用）"
      : "🎯 放銃者 (ロンの場合)";

  // ⚡ リアルタイム点数プレビュー文字列を生成
  const getExecutePreviewText = (): string => {
    if (isTenpai) {
      const tenpaiCount = matchCalc.winners.length;
      const noTenCount = tableSize - tenpaiCount;
      const totalPool =
        tableSize === 3 && rules.sanmaNoten === "2000" ? 2000 : 3000;
      if (tenpaiCount === 0 || noTenCount === 0) {
        return `⚡ 流局精算（全員${tenpaiCount === 0 ? "不聴" : "聴牌"} ±0点）`;
      }
      const plus = totalPool / tenpaiCount;
      const minus = totalPool / noTenCount;
      return `⚡ 流局精算（+${plus.toLocaleString()} / -${minus.toLocaleString()}）`;
    }

    if (matchCalc.type === "ron") {
      const honbaAdd = honbaCount * 300;
      const kyotakuAdd = kyotakuCount * 1000;
      if (matchCalc.winners.length === 0) {
        const koPt = calcHandPoints(
          false,
          "ron",
          matchCalc.scale,
          matchCalc.han,
          matchCalc.fu,
          tableSize,
          rules.sanmaTsumo
        ).pointsWinnerGets;
        const oyaPt = calcHandPoints(
          true,
          "ron",
          matchCalc.scale,
          matchCalc.han,
          matchCalc.fu,
          tableSize,
          rules.sanmaTsumo
        ).pointsWinnerGets;
        return `⚡ ロン精算（子:${koPt.toLocaleString()} / 親:${oyaPt.toLocaleString()}）`;
      }
      if (matchCalc.winners.length === 1) {
        const wId = matchCalc.winners[0];
        const isOya = wId === currentOyaId;
        const cfg = getWinnerConfig(wId);
        const basePt = calcHandPoints(
          isOya,
          "ron",
          cfg.scale,
          cfg.han,
          cfg.fu,
          tableSize,
          rules.sanmaTsumo
        ).pointsWinnerGets;
        const total = basePt + honbaAdd + kyotakuAdd;
        const extra =
          honbaAdd + kyotakuAdd > 0 ? ` ➔ 計+${total.toLocaleString()}` : "";
        return `⚡ 点数移動（${
          isOya ? "親" : "子"
        }ロン ${basePt.toLocaleString()}点${extra}）`;
      }
      // ダブロン時
      const parts = matchCalc.winners.map((wId) => {
        const isOya = wId === currentOyaId;
        const cfg = getWinnerConfig(wId);
        const pt = calcHandPoints(
          isOya,
          "ron",
          cfg.scale,
          cfg.han,
          cfg.fu,
          tableSize,
          rules.sanmaTsumo
        ).pointsWinnerGets;
        return `${getPlayerName(wId)}:${pt.toLocaleString()}`;
      });
      return `⚡ ダブロン移動（${parts.join(" / ")}）`;
    }

    // ツモ時
    const honbaTsumo = honbaCount * 100;
    const kyotakuAdd = kyotakuCount * 1000;
    if (matchCalc.winners.length === 0) {
      const koRes = calcHandPoints(
        false,
        "tsumo",
        matchCalc.scale,
        matchCalc.han,
        matchCalc.fu,
        tableSize,
        rules.sanmaTsumo
      );
      const oyaRes = calcHandPoints(
        true,
        "tsumo",
        matchCalc.scale,
        matchCalc.han,
        matchCalc.fu,
        tableSize,
        rules.sanmaTsumo
      );
      return `⚡ ツモ精算（子:${koRes.pointsKoPays.toLocaleString()}/${koRes.pointsOyaPays.toLocaleString()} 親:${oyaRes.pointsKoPays.toLocaleString()}オール）`;
    }

    const wId = matchCalc.winners[0];
    const isOya = wId === currentOyaId;
    const res = calcHandPoints(
      isOya,
      "tsumo",
      matchCalc.scale,
      matchCalc.han,
      matchCalc.fu,
      tableSize,
      rules.sanmaTsumo
    );
    const total =
      res.pointsWinnerGets + honbaTsumo * (tableSize - 1) + kyotakuAdd;
    if (isOya) {
      return `⚡ 点数移動（親ツモ ${res.pointsKoPays.toLocaleString()}オール / 計+${total.toLocaleString()}）`;
    }
    return `⚡ 点数移動（子ツモ ${res.pointsKoPays.toLocaleString()}/${res.pointsOyaPays.toLocaleString()} / 計+${total.toLocaleString()}）`;
  };

  const renderRoleSlotContent = (
    role: "winner" | "loser",
    placeholder: string
  ) => {
    if (role === "winner") {
      if (matchCalc.winners.length === 0) return placeholder;
      return matchCalc.winners.map((pId) => {
        const isLockedRiichi =
          matchCalc.type === "tenpai" && riichiPlayers.includes(pId);
        return (
          <div
            key={pId}
            className="match-player-chip"
            style={{
              margin: "2px",
              borderColor: isLockedRiichi ? "#fbbf24" : undefined,
            }}
            onClick={() => {
              if (isLockedRiichi) return;
              onUpdateMatchCalc({
                winners: matchCalc.winners.filter((id) => id !== pId),
              });
            }}
          >
            {getPlayerName(pId)}
          </div>
        );
      });
    } else {
      if (matchCalc.loser === null) return placeholder;
      return (
        <div
          className="match-player-chip"
          style={{ margin: "2px" }}
          onClick={() => onUpdateMatchCalc({ loser: null })}
        >
          {getPlayerName(matchCalc.loser)}
        </div>
      );
    }
  };

  // ダブロン時の和了者別手役切り替えタブ
  const renderDoubleRonTabs = (isLandscape: boolean) => {
    if (!isDoubleRon) return null;
    return (
      <div
        className={`double-ron-tabs ${
          isLandscape ? "ls-double-ron-tabs" : "mb-2"
        }`}
      >
        {matchCalc.winners.map((wId, idx) => {
          const cfg = getWinnerConfig(wId);
          const isEditing = editingWinnerId === wId;
          return (
            <button
              key={wId}
              type="button"
              onClick={() => setEditingWinnerId(wId)}
              className={`btn-dron-tab ${isEditing ? "active" : ""}`}
            >
              {idx + 1}. {getPlayerName(wId)} (
              {formatHandShortLabel(cfg.scale, cfg.han, cfg.fu)})
            </button>
          );
        })}
      </div>
    );
  };

  const renderScaleButtons = (isLandscape: boolean) => (
    <div className={`scale-buttons-grid ${isLandscape ? "ls-scale-grid" : ""}`}>
      <button
        type="button"
        className={`btn-scale btn-scale-lg ${
          isLandscape ? "ls-btn-scale" : ""
        } ${activeHandConfig.scale === "mangan" ? "active" : ""}`}
        onClick={() => handleToggleScale("mangan")}
      >
        満貫
      </button>
      <button
        type="button"
        className={`btn-scale btn-scale-lg ${
          isLandscape ? "ls-btn-scale" : ""
        } ${activeHandConfig.scale === "hanman" ? "active" : ""}`}
        onClick={() => handleToggleScale("hanman")}
      >
        跳満
      </button>
      <button
        type="button"
        className={`btn-scale btn-scale-lg ${
          isLandscape ? "ls-btn-scale" : ""
        } ${activeHandConfig.scale === "baiman" ? "active" : ""}`}
        onClick={() => handleToggleScale("baiman")}
      >
        倍満
      </button>
      <button
        type="button"
        className={`btn-scale btn-scale-sm3 ${
          isLandscape ? "ls-btn-scale-sm" : ""
        } ${activeHandConfig.scale === "sanbaiman" ? "active" : ""}`}
        onClick={() => handleToggleScale("sanbaiman")}
      >
        3倍満
      </button>
      <button
        type="button"
        className={`btn-scale btn-scale-sm3 ${
          isLandscape ? "ls-btn-scale-sm" : ""
        } ${activeHandConfig.scale === "yakuman" ? "active" : ""}`}
        onClick={() => handleToggleScale("yakuman")}
      >
        役満
      </button>
      <button
        type="button"
        className={`btn-scale btn-scale-sm3 ${
          isLandscape ? "ls-btn-scale-sm" : ""
        } ${activeHandConfig.scale === "double_yakuman" ? "active" : ""}`}
        onClick={() => handleToggleScale("double_yakuman")}
      >
        W役満
      </button>
    </div>
  );

  const renderSpecialActions = (isLandscape: boolean) => (
    <div className={`special-actions-box ${isLandscape ? "ls-special-box" : ""}`}>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onExecuteAbortiveDraw(true)}
          className="btn-special-action btn-special-amber flex-1"
        >
          🔄 途中流局 (親連荘)
        </button>
        <button
          type="button"
          onClick={() => onExecuteAbortiveDraw(false)}
          className="btn-special-action btn-special-sky flex-1"
        >
          ➡️ 途中流局 (親流れ)
        </button>
      </div>
      <button
        type="button"
        onClick={onExecuteChombo}
        className="btn-special-action btn-special-rose"
      >
        🚨 チョンボ精算（満貫払い・同局やり直し）
      </button>
    </div>
  );

  const previewBtnText = getExecutePreviewText();

  return (
    <div id="screen-match" className="screen">
      {/* ========================================== */}
      {/* 📱 縦持ち（Portrait）用レイアウト             */}
      {/* ========================================== */}
      <div className="view-portrait flex-1 flex-column">
        <div className="card bg-dark-header match-portrait-header flex justify-between items-center">
          <div className="flex items-center flex-wrap">
            <span
              className="text-2xl font-black text-amber"
              id="current-wind-label"
            >
              {oyaWind}
            </span>
            <span
              className="text-2xl font-black text-amber ml-1"
              id="current-kyoku-num"
            >
              {currentKyoku}
            </span>
            <span className="text-xl font-bold text-amber">局</span>
            <span id="current-honba" className="badge-honba">
              {honbaCount} 本場
            </span>
            <span id="current-kyotaku" className="badge-kyotaku">
              供託 {kyotakuCount}本
            </span>
          </div>
          <div className="flex items-center gap-1">
            {canUndo && (
              <button
                type="button"
                onClick={onUndoLastRound}
                className="btn-undo-header"
                title="1局前の状態に戻す"
              >
                ↩ 戻す
              </button>
            )}
            <button
              type="button"
              onClick={onOpenLogModal}
              className="btn-dark-sub btn"
              style={{ width: "auto", padding: "6px 8px", fontSize: "11px" }}
            >
              ログ
            </button>
            <button
              type="button"
              onClick={onEndMatch}
              className="btn-end-header"
            >
              終局
            </button>
          </div>
        </div>

        <div className="portrait-scroll-body pt-2">
          {/* サイコロカード */}
          <div className="card mb-2" style={{ padding: "8px 12px" }}>
            <div className="flex justify-between items-center">
              <button type="button" onClick={onRollDice} className="btn-dice">
                🎲 サイコロ
              </button>
              <div className="text-right">
                <span id="dice-result" className="dice-text">
                  {dice.resultText}
                </span>
                <div id="haipai-navi" className="navi-text">
                  {dice.naviText}
                </div>
              </div>
            </div>
          </div>

          {/* プレイヤー点数一覧カード */}
          <div className="card mb-2" style={{ padding: "4px 0" }}>
            <div
              className="card-header text-center"
              style={{
                background: "transparent",
                padding: "4px",
                fontSize: "11px",
              }}
            >
              現在の持ち点（点数タップで3秒間点差表示 / ✎で手入力修正）
            </div>
            <div id="match-players-list" className="table-rows">
              {activePlayers.slice(0, tableSize).map((pId, idx) => {
                const windIdx = (idx - oyaIndex + tableSize) % tableSize;
                const wind = WIND_LABELS[windIdx];
                const isOya = wind === "東";
                const isRiichi = riichiPlayers.includes(pId);
                const score =
                  currentPoints[pId] !== undefined
                    ? currentPoints[pId]
                    : startPoints;
                const disp = getScoreDisplayInfo(pId, score);

                return (
                  <div
                    key={pId}
                    id={`match-row-${pId}`}
                    className={`match-row ${isRiichi ? "is-riichi" : ""}`}
                  >
                    <div className="flex items-center gap-1">
                      <span
                        className={`wind-badge ${isOya ? "wind-badge-oya" : ""}`}
                      >
                        {wind}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleRiichi(pId)}
                        className={`btn-riichi ${isRiichi ? "active-riichi" : ""}`}
                      >
                        {isRiichi ? "立直中✕" : "立直"}
                      </button>
                      <div
                        id={`m-chip-${pId}`}
                        className="match-player-chip"
                        draggable
                        onClick={() => handlePlayerChipTap(pId)}
                        onDragStart={() => setDraggingPlayerId(pId)}
                        onDragEnd={() => {
                          setDraggingPlayerId(null);
                          setDragOverTarget(null);
                        }}
                        onTouchStart={(e) => handleTouchStart(e, pId)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={(e) => handleTouchEnd(e, pId)}
                      >
                        {getPlayerName(pId)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        id={`match-pt-${pId}`}
                        onClick={() => handleScoreBoxClick(pId)}
                        className={`score-diff-btn score-mode-${disp.mode}`}
                        title="タップして3秒間このプレイヤー基準の点差を表示"
                      >
                        {disp.text}
                      </button>
                      <button
                        type="button"
                        onClick={(e) =>
                          handleScoreManualEditPrompt(e, pId, score)
                        }
                        className="btn-score-edit-mini"
                        title="点数を手入力で修正"
                      >
                        ✎
                      </button>
                    </div>
                  </div>
                );
              })}
              {is43Mode && subPlayer !== null && (
                <div className="match-row match-row-sub">
                  <div className="flex items-center gap-1">
                    <span className="wind-badge wind-badge-sub">控</span>
                    <span
                      className="player-name-text"
                      style={{ fontSize: "13px", color: "#94a3b8" }}
                    >
                      {getPlayerName(subPlayer)}（抜け番）
                    </span>
                  </div>
                  <span
                    className="font-mono font-bold"
                    style={{
                      color: "#64748b",
                      fontSize: "16px",
                      paddingRight: "8px",
                    }}
                  >
                    {(currentPoints[subPlayer] ?? startPoints).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 📱 縦画面用 直感精算パネル */}
          <div className="card bg-panel">
            <span className="input-label-sm text-center text-emerald">
              ✨ 直感精算パネル:
            </span>
            <div className="flex gap-2 mb-2">
              <div
                id="box-winner"
                className={`role-box winner-target ${
                  dragOverTarget === "winner" ? "drag-over" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTarget("winner");
                }}
                onDragLeave={() => setDragOverTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTarget(null);
                  if (draggingPlayerId !== null) {
                    assignToRole(draggingPlayerId, "winner");
                    setDraggingPlayerId(null);
                  }
                }}
              >
                <span className="role-label" id="role-winner-label">
                  {winnerLabelText}
                </span>
                <div className="role-slot flex-wrap-gap" id="slot-winner">
                  {renderRoleSlotContent(
                    "winner",
                    "ここにプレイヤーをドロップ"
                  )}
                </div>
              </div>

              <div
                id="role-loser-box"
                className={`role-box loser-target ${
                  dragOverTarget === "loser" ? "drag-over" : ""
                }`}
                style={{
                  opacity: isTenpai || isSpecial ? 0.2 : isTsumo ? 0.3 : 1,
                }}
                onDragOver={(e) => {
                  if (isTenpai || isSpecial) return;
                  e.preventDefault();
                  setDragOverTarget("loser");
                }}
                onDragLeave={() => setDragOverTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTarget(null);
                  if (draggingPlayerId !== null && !isTenpai && !isSpecial) {
                    assignToRole(draggingPlayerId, "loser");
                    setDraggingPlayerId(null);
                  }
                }}
              >
                <span className="role-label" id="role-loser-label">
                  {loserLabelText}
                </span>
                <div className="role-slot flex-wrap-gap" id="slot-loser">
                  {renderRoleSlotContent("loser", "ここにプレイヤーをドロップ")}
                </div>
              </div>
            </div>

            <div className="flex gap-1 mb-2">
              <button
                type="button"
                onClick={() => handleSetAgariType("ron")}
                id="btn-agari-ron"
                className={`btn-type ${matchCalc.type === "ron" ? "active" : ""}`}
              >
                ロン
              </button>
              <button
                type="button"
                onClick={() => handleSetAgariType("tsumo")}
                id="btn-agari-tsumo"
                className={`btn-type ${
                  matchCalc.type === "tsumo" ? "active" : ""
                }`}
              >
                ツモ
              </button>
              <button
                type="button"
                onClick={() => handleSetAgariType("tenpai")}
                id="btn-agari-tenpai"
                className={`btn-type ${
                  matchCalc.type === "tenpai" ? "active-tenpai" : ""
                }`}
              >
                聴牌
              </button>
              <button
                type="button"
                onClick={() => handleSetAgariType("special")}
                id="btn-agari-special"
                className={`btn-type ${
                  matchCalc.type === "special" ? "active-special" : ""
                }`}
              >
                特殊
              </button>
              <button
                type="button"
                onClick={onClearRoleSlots}
                className="btn-clear"
              >
                クリア
              </button>
            </div>

            {isSpecial ? (
              renderSpecialActions(false)
            ) : (
              <>
                {!isTenpai && (
                  <>
                    {renderDoubleRonTabs(false)}
                    <div id="panel-detail-box" className="flex gap-2 mb-2">
                      <div className="flex-1">
                        <select
                          id="select-fu"
                          className="inline-select-sm"
                          value={activeHandConfig.fu}
                          onChange={(e) =>
                            updateActiveHandConfig({
                              fu: Number(e.target.value),
                            })
                          }
                        >
                          <option value={20}>20符（ピンフツモなど）</option>
                          <option value={25}>25符（七対子）</option>
                          <option value={30}>30符</option>
                          <option value={40}>40符</option>
                          <option value={50}>50符</option>
                          <option value={60}>60符</option>
                          <option value={70}>70符</option>
                          <option value={80}>80符以上</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <select
                          id="select-han"
                          className="inline-select-sm"
                          value={activeHandConfig.han}
                          onChange={(e) =>
                            updateActiveHandConfig({
                              han: Number(e.target.value),
                            })
                          }
                        >
                          <option value={1}>1翻</option>
                          <option value={2}>2翻</option>
                          <option value={3}>3翻</option>
                          <option value={4}>4翻</option>
                        </select>
                      </div>
                    </div>

                    <div id="panel-scale-box" className="mb-2">
                      <div className="input-label-sm">【満貫クラス】</div>
                      {renderScaleButtons(false)}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={onExecutePointTransfer}
                  className="btn-execute mt-2"
                >
                  {previewBtnText}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* 💻 横持ち（Landscape）用レイアウト            */}
      {/* ========================================== */}
      <div className="view-landscape">
        {/* 左側：麻雀卓ボードエリア */}
        <div className="table-board-area">
          <div className="mahjong-table">
            {/* 中央ハブ（局数・本場・供託のリアルタイム同期） */}
            <div className="table-center-hub">
              <span id="ls-center-round" className="center-round">
                {roundStr}
              </span>
              <span id="ls-center-honba" className="center-honba">
                {honbaCount}本場 / 供託{kyotakuCount}本
              </span>
            </div>

            {/* 4つの座席（手前・右・奥・左） */}
            {LANDSCAPE_SEAT_CONFIG.map((seatCfg, physicalIndex) => {
              if (isSanma && !is43Mode && physicalIndex === 3) {
                return (
                  <div
                    key={seatCfg.id}
                    id={seatCfg.id}
                    className={`${seatCfg.className} seat-vacant`}
                  >
                    <div className="seat-header-row justify-center">
                      <span className="vacant-badge">不使用</span>
                    </div>
                    <div className="seat-score-row">
                      <span
                        className="seat-score-text"
                        style={{ color: "#475569", fontSize: "16px" }}
                      >
                        ---
                      </span>
                    </div>
                  </div>
                );
              }

              if (is43Mode && physicalIndex === 3) {
                const subId = subPlayer;
                const subScore =
                  subId !== null && currentPoints[subId] !== undefined
                    ? currentPoints[subId]
                    : startPoints;
                return (
                  <div
                    key={seatCfg.id}
                    id={seatCfg.id}
                    className={`${seatCfg.className} seat-vacant`}
                  >
                    <div className="seat-header-row">
                      <span className="vacant-badge">控</span>
                      <span className="match-player-chip seat-sub-name">
                        {subId !== null ? getPlayerName(subId) : "控え"}
                      </span>
                    </div>
                    <div className="seat-score-row">
                      <span
                        className="seat-score-text"
                        style={{ color: "#64748b" }}
                      >
                        {subScore.toLocaleString()}
                      </span>
                    </div>
                  </div>
                );
              }

              const pId = activePlayers[physicalIndex];
              if (pId === undefined) return null;

              const windIdx = (physicalIndex - oyaIndex + tableSize) % tableSize;
              const seatWind = WIND_LABELS[windIdx];
              const isOya = seatWind === "東";
              const isRiichi = riichiPlayers.includes(pId);
              const pScore =
                currentPoints[pId] !== undefined
                  ? currentPoints[pId]
                  : startPoints;
              const disp = getScoreDisplayInfo(pId, pScore);

              return (
                <div
                  key={seatCfg.id}
                  id={seatCfg.id}
                  className={seatCfg.className}
                >
                  <div className="seat-header-row">
                    <div className="flex items-center gap-1">
                      <span
                        className={`wind-badge-sm ${
                          isOya ? "bg-amber-500" : ""
                        }`}
                      >
                        {seatWind}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleRiichi(pId)}
                        className={`btn-riichi ${isRiichi ? "active-riichi" : ""}`}
                      >
                        {isRiichi ? "立直中✕" : "立直"}
                      </button>
                    </div>
                    <div
                      id={`ls-chip-${pId}`}
                      className="match-player-chip"
                      draggable
                      onClick={() => handlePlayerChipTap(pId)}
                      onDragStart={() => setDraggingPlayerId(pId)}
                      onDragEnd={() => {
                        setDraggingPlayerId(null);
                        setDragOverTarget(null);
                      }}
                      onTouchStart={(e) => handleTouchStart(e, pId)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={(e) => handleTouchEnd(e, pId)}
                    >
                      {getPlayerName(pId)}
                    </div>
                  </div>
                  <div
                    className={`seat-score-row ls-score-mode-${disp.mode}`}
                    onClick={() => handleScoreBoxClick(pId)}
                    title="タップして3秒間このプレイヤーとの点差を表示"
                  >
                    <span
                      className={`seat-score-text ls-score-txt-${disp.mode}`}
                    >
                      {disp.text}
                    </span>
                  </div>
                  <div
                    className={`riichi-stick ${isRiichi ? "" : "hidden"}`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* 右側：横画面専用のコンパクト操作サイドバー */}
        <div className="sidebar-panel-area">
          {/* ヘッダー操作行 */}
          <div className="card bg-dark-header ls-header-card flex justify-between items-center">
            <div className="flex items-center">
              <span
                className="font-black text-amber ls-round-txt"
                id="ls-wind-label"
              >
                {oyaWind}
              </span>
              <span
                className="font-black text-amber ml-1 ls-round-txt"
                id="ls-kyoku-num"
              >
                {currentKyoku}
              </span>
              <span
                className="font-bold text-amber"
                style={{ fontSize: "12px" }}
              >
                局
              </span>
              <span id="ls-honba" className="badge-honba ls-badge-honba">
                {honbaCount}本場
              </span>
            </div>
            <div className="flex items-center gap-1">
              {canUndo && (
                <button
                  type="button"
                  onClick={onUndoLastRound}
                  className="btn-undo-header ls-undo-btn"
                  title="1局前の状態に戻す"
                >
                  ↩戻す
                </button>
              )}
              <button
                type="button"
                onClick={onOpenLogModal}
                className="btn-dark-sub btn ls-top-btn"
              >
                ログ
              </button>
              <button
                type="button"
                onClick={onEndMatch}
                className="btn-end-header ls-end-btn"
              >
                終局
              </button>
            </div>
          </div>

          {/* サイコロ・ナビカード */}
          <div className="card ls-dice-card">
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={onRollDice}
                className="btn-dice ls-btn-dice"
              >
                🎲 サイコロ
              </button>
              <div className="text-right" style={{ lineHeight: 1.15 }}>
                <span id="ls-dice-result" className="dice-text ls-dice-txt">
                  {dice.resultText}
                </span>
                <div id="ls-haipai-navi" className="navi-text ls-navi-txt">
                  {dice.naviText}
                </div>
              </div>
            </div>
          </div>

          {/* 横持ち用 直感精算操作パネル */}
          <div className="card bg-panel ls-calc-panel">
            <div className="flex gap-1 ls-type-row">
              <button
                type="button"
                onClick={() => handleSetAgariType("ron")}
                id="ls-btn-agari-ron"
                className={`btn-type ls-btn-type ${
                  matchCalc.type === "ron" ? "active" : ""
                }`}
              >
                ロン
              </button>
              <button
                type="button"
                onClick={() => handleSetAgariType("tsumo")}
                id="ls-btn-agari-tsumo"
                className={`btn-type ls-btn-type ${
                  matchCalc.type === "tsumo" ? "active" : ""
                }`}
              >
                ツモ
              </button>
              <button
                type="button"
                onClick={() => handleSetAgariType("tenpai")}
                id="ls-btn-agari-tenpai"
                className={`btn-type ls-btn-type ${
                  matchCalc.type === "tenpai" ? "active-tenpai" : ""
                }`}
              >
                聴牌
              </button>
              <button
                type="button"
                onClick={() => handleSetAgariType("special")}
                id="ls-btn-agari-special"
                className={`btn-type ls-btn-type ${
                  matchCalc.type === "special" ? "active-special" : ""
                }`}
              >
                特殊
              </button>
              <button
                type="button"
                onClick={onClearRoleSlots}
                className="btn-clear ls-btn-clear"
              >
                クリア
              </button>
            </div>

            <div className="flex gap-1 ls-role-row">
              <div
                id="ls-box-winner"
                className={`role-box winner-target ls-role-box ${
                  dragOverTarget === "winner" ? "drag-over" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverTarget("winner");
                }}
                onDragLeave={() => setDragOverTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTarget(null);
                  if (draggingPlayerId !== null) {
                    assignToRole(draggingPlayerId, "winner");
                    setDraggingPlayerId(null);
                  }
                }}
              >
                <span
                  className="role-label ls-role-label"
                  id="ls-role-winner-label"
                >
                  {isSpecial
                    ? "🚨 チョンボ者"
                    : isTenpai
                    ? "⭕ 聴牌"
                    : isDoubleRon
                    ? `🏆 ダブロン(${matchCalc.winners.length})`
                    : "🏆 和了"}
                </span>
                <div
                  className="role-slot flex-wrap-gap ls-role-slot"
                  id="ls-slot-winner"
                >
                  {renderRoleSlotContent("winner", "ドロップ/タップ")}
                </div>
              </div>

              <div
                id="ls-role-loser-box"
                className={`role-box loser-target ls-role-box ${
                  dragOverTarget === "loser" ? "drag-over" : ""
                }`}
                style={{
                  opacity: isTenpai || isSpecial ? 0.2 : isTsumo ? 0.3 : 1,
                }}
                onDragOver={(e) => {
                  if (isTenpai || isSpecial) return;
                  e.preventDefault();
                  setDragOverTarget("loser");
                }}
                onDragLeave={() => setDragOverTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverTarget(null);
                  if (draggingPlayerId !== null && !isTenpai && !isSpecial) {
                    assignToRole(draggingPlayerId, "loser");
                    setDraggingPlayerId(null);
                  }
                }}
              >
                <span
                  className="role-label ls-role-label"
                  id="ls-role-loser-label"
                >
                  {isTenpai || isSpecial ? "❌ 不使用" : "🎯 放銃"}
                </span>
                <div
                  className="role-slot flex-wrap-gap ls-role-slot"
                  id="ls-slot-loser"
                >
                  {renderRoleSlotContent("loser", "ドロップ/タップ")}
                </div>
              </div>
            </div>

            {isSpecial ? (
              renderSpecialActions(true)
            ) : (
              <>
                {!isTenpai && (
                  <>
                    {renderDoubleRonTabs(true)}
                    <div
                      id="ls-panel-detail-box"
                      className="flex gap-1 ls-detail-row"
                    >
                      <div className="flex-1">
                        <select
                          id="ls-select-fu"
                          className="inline-select-sm ls-select-sm"
                          value={activeHandConfig.fu}
                          onChange={(e) =>
                            updateActiveHandConfig({
                              fu: Number(e.target.value),
                            })
                          }
                        >
                          <option value={20}>20符</option>
                          <option value={25}>25符</option>
                          <option value={30}>30符</option>
                          <option value={40}>40符</option>
                          <option value={50}>50符</option>
                          <option value={60}>60符</option>
                          <option value={70}>70符</option>
                          <option value={80}>80符以上</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <select
                          id="ls-select-han"
                          className="inline-select-sm ls-select-sm"
                          value={activeHandConfig.han}
                          onChange={(e) =>
                            updateActiveHandConfig({
                              han: Number(e.target.value),
                            })
                          }
                        >
                          <option value={1}>1翻</option>
                          <option value={2}>2翻</option>
                          <option value={3}>3翻</option>
                          <option value={4}>4翻</option>
                        </select>
                      </div>
                    </div>

                    <div id="ls-panel-scale-box" className="ls-scale-box">
                      {renderScaleButtons(true)}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={onExecutePointTransfer}
                  className="btn-execute ls-btn-execute"
                >
                  {previewBtnText}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* タッチドラッグ中の追従ゴーストチップ */}
      {touchGhost && touchMovedRef.current && (
        <div
          className="match-player-chip touch-drag-ghost"
          style={{
            left: `${touchGhost.x}px`,
            top: `${touchGhost.y}px`,
          }}
        >
          {touchGhost.name}
        </div>
      )}
    </div>
  );
};
