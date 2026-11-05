import React, { useRef, useState } from "react";
import { CustomRules, GameMode, WIND_LABELS } from "../types";

interface RulesScreenProps {
  allPlayers: number[];
  seatAssignments: (number | null)[];
  rules: CustomRules;
  getPlayerName: (id: number) => string;
  onUpdateRules: (partial: Partial<CustomRules>) => void;
  onUpdateSeats: (newSeats: (number | null)[]) => void;
  onStartMatch: () => void;
  onBackToRegister: () => void;
}

export const RulesScreen: React.FC<RulesScreenProps> = ({
  allPlayers,
  seatAssignments,
  rules,
  getPlayerName,
  onUpdateRules,
  onUpdateSeats,
  onStartMatch,
  onBackToRegister,
}) => {
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [dragOverSeat, setDragOverSeat] = useState<number | "pool" | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
  const [touchGhost, setTouchGhost] = useState<{
    playerId: number;
    name: string;
    x: number;
    y: number;
  } | null>(null);

  const touchMovedRef = useRef(false);

  const renderSeatsCount =
    rules.gameMode === "4-3打ち" ? 4 : parseInt(rules.gameMode, 10);

  // プールに残っているプレイヤー（どの席にも配置されていないメンバー）
  const seatedIds = seatAssignments
    .slice(0, renderSeatsCount)
    .filter((id): id is number => id !== null);
  const poolPlayers = allPlayers.filter((id) => !seatedIds.includes(id));

  const assignPlayerToSeat = (playerId: number, seatIndex: number) => {
    const next = [...seatAssignments];
    while (next.length < renderSeatsCount) next.push(null);

    // すでに別の席にいたら元の席から外す（入れ替え対応）
    const prevSeatIndex = next.findIndex((id) => id === playerId);
    const targetCurrentPlayer = next[seatIndex];

    if (prevSeatIndex !== -1 && prevSeatIndex !== seatIndex) {
      next[prevSeatIndex] = targetCurrentPlayer ?? null;
    }
    next[seatIndex] = playerId;
    onUpdateSeats(next.slice(0, renderSeatsCount));
  };

  const returnPlayerToPool = (playerId: number) => {
    const next = seatAssignments
      .slice(0, renderSeatsCount)
      .map((id) => (id === playerId ? null : id));
    onUpdateSeats(next);
  };

  // チップをタップした時の直感操作（プールなら空き席へ、席ならプールへ戻す）
  const handleChipClick = (playerId: number, isSeated: boolean) => {
    if (touchMovedRef.current) return;
    if (isSeated) {
      returnPlayerToPool(playerId);
    } else {
      const next = [...seatAssignments];
      while (next.length < renderSeatsCount) next.push(null);
      const emptyIdx = next.findIndex(
        (id, idx) => idx < renderSeatsCount && id === null
      );
      if (emptyIdx !== -1) {
        next[emptyIdx] = playerId;
        onUpdateSeats(next.slice(0, renderSeatsCount));
      }
    }
  };

  const handleRandomizeSeats = () => {
    const shuffled = [...allPlayers].sort(() => Math.random() - 0.5);
    const next: (number | null)[] = [];
    for (let i = 0; i < renderSeatsCount; i++) {
      next.push(shuffled[i] ?? null);
    }
    onUpdateSeats(next);
  };

  const handleClearSeats = () => {
    onUpdateSeats(new Array(renderSeatsCount).fill(null));
  };

  const handleGameModeChange = (mode: GameMode) => {
    const count = mode === "4-3打ち" ? 4 : parseInt(mode, 10);
    onUpdateRules({ gameMode: mode });
    const next = seatAssignments.slice(0, count);
    while (next.length < count) next.push(null);
    onUpdateSeats(next);
  };

  // Touch Drag & Drop ハンドラ
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
      setDragOverSeat(null);
      return;
    }
    const seatBox = targetEl.closest("[data-seat-index]");
    if (seatBox) {
      const idx = Number(seatBox.getAttribute("data-seat-index"));
      setDragOverSeat(idx);
      return;
    }
    const poolBox = targetEl.closest("#pool-container");
    if (poolBox) {
      setDragOverSeat("pool");
      return;
    }
    setDragOverSeat(null);
  };

  const handleTouchEnd = (e: React.TouchEvent, playerId: number) => {
    if (touchMovedRef.current) {
      const touch = e.changedTouches[0];
      const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
      if (targetEl) {
        const seatBox = targetEl.closest("[data-seat-index]");
        if (seatBox) {
          const idx = Number(seatBox.getAttribute("data-seat-index"));
          assignPlayerToSeat(playerId, idx);
        } else if (targetEl.closest("#pool-container")) {
          returnPlayerToPool(playerId);
        }
      }
    }
    setDraggingPlayerId(null);
    setDragOverSeat(null);
    setTouchGhost(null);
    setTimeout(() => {
      touchMovedRef.current = false;
    }, 50);
  };

  return (
    <div id="screen-rules" className="screen">
      {/* ① 上段共通タイトルエリア */}
      <div className="screen-header text-center">
        <h1 className="title">ルール・卓設定</h1>
        <p className="subtitle">ルール調整とメンバーの席決め</p>
      </div>

      {/* ② メインコンテンツエリア（縦持ち：スクロール、横持ち：左右2カラム） */}
      <div className="rules-content-body">
        {/* 👈 【左側ブロック】：席決めドラッグ＆ドロップ / タップエリア */}
        <div className="rules-left-block">
          <div className="flex justify-between items-center mb-2">
            <div className="drag-instruction" style={{ marginBottom: 0 }}>
              席決め（ドラッグまたはタップで配置）
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleRandomizeSeats}
                className="btn-mini-action"
              >
                🎲 ランダム
              </button>
              <button
                type="button"
                onClick={handleClearSeats}
                className="btn-mini-action btn-mini-sub"
              >
                クリア
              </button>
            </div>
          </div>

          <div className="input-label-sm">参加メンバー（タグ）:</div>
          <div
            id="pool-container"
            className={`chip-pool ${dragOverSeat === "pool" ? "drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverSeat("pool");
            }}
            onDragLeave={() => setDragOverSeat(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverSeat(null);
              if (draggingPlayerId !== null) {
                returnPlayerToPool(draggingPlayerId);
                setDraggingPlayerId(null);
              }
            }}
          >
            {poolPlayers.map((pId) => (
              <div
                key={pId}
                id={`chip-${pId}`}
                className="player-chip"
                draggable
                onClick={() => handleChipClick(pId, false)}
                onDragStart={() => setDraggingPlayerId(pId)}
                onDragEnd={() => {
                  setDraggingPlayerId(null);
                  setDragOverSeat(null);
                }}
                onTouchStart={(e) => handleTouchStart(e, pId)}
                onTouchMove={handleTouchMove}
                onTouchEnd={(e) => handleTouchEnd(e, pId)}
              >
                {getPlayerName(pId)}
              </div>
            ))}
            {poolPlayers.length === 0 && (
              <span className="pool-empty-hint">全員配置済み（席タップで解除）</span>
            )}
          </div>

          <div className="input-label-sm" style={{ marginTop: "8px" }}>
            対局席配置:
          </div>
          <div id="seats-container" className="seats-grid">
            {Array.from({ length: renderSeatsCount }).map((_, idx) => {
              const label =
                rules.gameMode === "4-3打ち" && idx === 3
                  ? "控（抜け番）"
                  : `${WIND_LABELS[idx]}家 席`;
              const assignedId = seatAssignments[idx] ?? null;

              return (
                <div
                  key={idx}
                  id={`seat-${idx}`}
                  data-seat-index={idx}
                  className={`seat-box ${dragOverSeat === idx ? "drag-over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverSeat(idx);
                  }}
                  onDragLeave={() => setDragOverSeat(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverSeat(null);
                    if (draggingPlayerId !== null) {
                      assignPlayerToSeat(draggingPlayerId, idx);
                      setDraggingPlayerId(null);
                    }
                  }}
                >
                  <span className="seat-label active-wind">{label}</span>
                  {assignedId !== null ? (
                    <div
                      id={`chip-${assignedId}`}
                      className="player-chip"
                      draggable
                      onClick={() => handleChipClick(assignedId, true)}
                      onDragStart={() => setDraggingPlayerId(assignedId)}
                      onDragEnd={() => {
                        setDraggingPlayerId(null);
                        setDragOverSeat(null);
                      }}
                      onTouchStart={(e) => handleTouchStart(e, assignedId)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={(e) => handleTouchEnd(e, assignedId)}
                    >
                      {getPlayerName(assignedId)}
                    </div>
                  ) : (
                    <span className="seat-empty-placeholder">未配置</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 👉 【右側ブロック】：スクロール設定 ＆ 決定ボタンエリア */}
        <div className="rules-right-block">
          <div className="rules-right-config-scroll space-y-3">
            {/* 基本設定カード */}
            <div className="card">
              <label className="input-label">麻雀種目（卓の人数）</label>
              <select
                id="game-mode-select"
                className="form-select"
                value={rules.gameMode}
                onChange={(e) =>
                  handleGameModeChange(e.target.value as GameMode)
                }
              >
                <option value="4">4人麻雀 (4人打ち)</option>
                <option value="3">3人麻雀 (3人打ち)</option>
                <option value="4-3打ち">4人3打ち (4人登録/親流れで交代)</option>
              </select>
            </div>

            {/* カスタムルールアコーディオンヘッダー */}
            <div
              className="card card-header accordion-header"
              onClick={() => setAccordionOpen((prev) => !prev)}
            >
              <span>カスタムルール設定</span>
              <span
                id="accordion-icon"
                className={`accordion-icon ${accordionOpen ? "open" : ""}`}
              >
                ▲
              </span>
            </div>

            {/* アコーディオン展開内部 */}
            {accordionOpen && (
              <div id="accordion-content" className="space-y-3">
                <div className="card-sub">
                  <div className="table-row-flex">
                    <span>ゲームの長さ</span>
                    <select
                      id="rule-length"
                      className="inline-select"
                      value={rules.length}
                      onChange={(e) =>
                        onUpdateRules({
                          length: e.target.value as CustomRules["length"],
                        })
                      }
                    >
                      <option value="tonan">東南戦</option>
                      <option value="tonpu">東風戦</option>
                    </select>
                  </div>
                  <div className="table-row-flex">
                    <span>持ち点 / 返し点</span>
                    <select
                      id="rule-points"
                      className="inline-select"
                      value={rules.points}
                      onChange={(e) =>
                        onUpdateRules({
                          points: e.target.value as CustomRules["points"],
                        })
                      }
                    >
                      <option value="25000-30000">25000 / 30000</option>
                      <option value="30000-30000">30000 / 30000</option>
                      <option value="30000-35000">30000 / 35000</option>
                    </select>
                  </div>
                  <div className="table-row-flex">
                    <span>順位ウマ</span>
                    <select
                      id="rule-uma"
                      className="inline-select"
                      value={rules.uma}
                      onChange={(e) =>
                        onUpdateRules({
                          uma: e.target.value as CustomRules["uma"],
                        })
                      }
                    >
                      <option value="10-30">10 - 30</option>
                      <option value="10-20">10 - 20</option>
                      <option value="none">ウマなし</option>
                    </select>
                  </div>
                  <div className="table-row-flex">
                    <span>連荘条件</span>
                    <select
                      id="rule-renchan"
                      className="inline-select"
                      value={rules.renchan}
                      onChange={(e) =>
                        onUpdateRules({
                          renchan: e.target.value as CustomRules["renchan"],
                        })
                      }
                    >
                      <option value="tenpai">聴牌連荘</option>
                      <option value="agari">和了連荘</option>
                    </select>
                  </div>
                  <div className="table-row-flex">
                    <span>トビルール</span>
                    <select
                      id="rule-tobi"
                      className="inline-select"
                      value={rules.tobi}
                      onChange={(e) =>
                        onUpdateRules({
                          tobi: e.target.value as CustomRules["tobi"],
                        })
                      }
                    >
                      <option value="ari">あり（マイナスで即終了）</option>
                      <option value="nashi">なし（マイナスでも続行）</option>
                    </select>
                  </div>
                  <div className="table-row-flex">
                    <span>喰いタン/後付け</span>
                    <select
                      id="rule-kuitan"
                      className="inline-select"
                      value={rules.kuitan}
                      onChange={(e) =>
                        onUpdateRules({
                          kuitan: e.target.value as CustomRules["kuitan"],
                        })
                      }
                    >
                      <option value="ariari">ありあり</option>
                      <option value="ari-nashi">食いあり後なし</option>
                      <option value="nashinashi">なしなし</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 横持ち用：右カラム下部固定ボタンエリア */}
          <div className="rules-right-btn-area rules-btn-landscape">
            <button
              type="button"
              onClick={onStartMatch}
              className="btn btn-amber"
            >
              🀄 この配置で対局開始
            </button>
            <button
              type="button"
              onClick={onBackToRegister}
              className="btn btn-dark-sub"
            >
              メンバー登録に戻る
            </button>
          </div>
        </div>
      </div>

      {/* 縦持ち用：画面最下部固定ボタンエリア */}
      <div className="portrait-fixed-footer rules-btn-portrait">
        <button type="button" onClick={onStartMatch} className="btn btn-amber">
          🀄 この配置で対局開始
        </button>
        <button
          type="button"
          onClick={onBackToRegister}
          className="btn btn-dark-sub mt-2"
        >
          メンバー登録に戻る
        </button>
      </div>

      {/* タッチドラッグ中の追従ゴーストチップ */}
      {touchGhost && touchMovedRef.current && (
        <div
          className="player-chip touch-drag-ghost"
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

