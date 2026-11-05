import React, { useEffect, useState } from "react";
import { Room } from "../types";

interface RegisterScreenProps {
  rooms: Record<string, Room>;
  currentRoomName: string;
  allPlayers: number[];
  onSelectRoom: (roomName: string) => void;
  onCreateRoom: (roomName: string) => void;
  onDeleteCurrentRoom: () => void;
  onSubmitRegistration: (
    entries: { id: number | null; name: string }[],
    newRoomName?: string
  ) => void;
  onResetAllData: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  rooms,
  currentRoomName,
  allPlayers,
  onSelectRoom,
  onCreateRoom,
  onDeleteCurrentRoom,
  onSubmitRegistration,
  onResetAllData,
}) => {
  const currentRoom = rooms[currentRoomName] || {
    roomName: currentRoomName,
    gameCount: 0,
    nextPlayerId: 1,
    players: {},
  };

  const roomPlayerIds = Object.keys(currentRoom.players).map((id) =>
    Number(id)
  );

  const initialCount = Math.max(
    4,
    allPlayers.length,
    roomPlayerIds.length,
    3
  );
  const [memberCount, setMemberCount] = useState<number>(
    Math.min(10, initialCount)
  );
  const [newRoomInput, setNewRoomInput] = useState<string>("");
  const [inputEntries, setInputEntries] = useState<
    { id: number | null; name: string }[]
  >([]);

  // ルーム変更時にプレイヤー入力欄を同期
  useEffect(() => {
    const room = rooms[currentRoomName] || { players: {} };
    const pIds = Object.keys(room.players).map((k) => Number(k));
    const targetCount = Math.min(
      10,
      Math.max(pIds.length, memberCount >= 3 ? memberCount : 4)
    );
    if (targetCount !== memberCount && pIds.length > memberCount) {
      setMemberCount(targetCount);
    }

    const nextEntries: { id: number | null; name: string }[] = [];
    for (let i = 0; i < targetCount; i++) {
      const pId = pIds[i] ?? null;
      const pName = pId !== null && room.players[pId] ? room.players[pId].name : "";
      nextEntries.push({ id: pId, name: pName });
    }
    setInputEntries(nextEntries);
  }, [currentRoomName, rooms]);

  // 人数変更時に入力枠数を調整（入力中の内容は維持）
  const handleCountChange = (newCount: number) => {
    setMemberCount(newCount);
    setInputEntries((prev) => {
      const room = rooms[currentRoomName] || { players: {} };
      const pIds = Object.keys(room.players).map((k) => Number(k));
      const next: { id: number | null; name: string }[] = [];
      for (let i = 0; i < newCount; i++) {
        if (i < prev.length) {
          next.push(prev[i]);
        } else {
          const pId = pIds[i] ?? null;
          const pName =
            pId !== null && room.players[pId] ? room.players[pId].name : "";
          next.push({ id: pId, name: pName });
        }
      }
      return next;
    });
  };

  const handleNameChange = (index: number, value: string) => {
    setInputEntries((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, name: value } : item))
    );
  };

  const handleAddNewRoom = () => {
    const trimmed = newRoomInput.trim();
    if (!trimmed) return;
    onCreateRoom(trimmed);
    setNewRoomInput("");
  };

  const handleConfirm = () => {
    const trimmedRoom = newRoomInput.trim();
    onSubmitRegistration(inputEntries.slice(0, memberCount), trimmedRoom || undefined);
    if (trimmedRoom) {
      setNewRoomInput("");
    }
  };

  return (
    <div id="screen-register" className="screen">
      <div className="screen-header text-center">
        <h1 className="title">麻雀マネージャー</h1>
        <p className="subtitle">参加メンバー登録</p>
      </div>

      <div className="register-content-body">
        {/* 左カラム（縦持ち時は上段）：ルーム選択・参加人数設定 */}
        <div className="register-left-col">
          <div className="card">
            <label className="input-label">対局ルーム（グループ）の選択</label>
            <select
              id="room-select"
              className="form-select"
              value={currentRoomName}
              onChange={(e) => onSelectRoom(e.target.value)}
            >
              {Object.keys(rooms).map((rName) => (
                <option key={rName} value={rName}>
                  {rName}
                </option>
              ))}
            </select>

            <div className="room-action-row mt-3">
              <input
                type="text"
                id="new-room-input"
                placeholder="新規ルーム名を入力"
                className="form-input form-input-sm"
                value={newRoomInput}
                onChange={(e) => setNewRoomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddNewRoom();
                }}
              />
              {newRoomInput.trim() && (
                <button
                  type="button"
                  onClick={handleAddNewRoom}
                  className="btn btn-emerald room-action-btn"
                >
                  ＋追加
                </button>
              )}
              <button
                type="button"
                onClick={onDeleteCurrentRoom}
                className="btn btn-rose room-action-btn"
              >
                🗑 削除
              </button>
            </div>
          </div>

          <div className="card">
            <label className="input-label">本日の参加人数</label>
            <select
              id="member-count-select"
              className="form-select"
              value={memberCount}
              onChange={(e) => handleCountChange(Number(e.target.value))}
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <option key={num} value={num}>
                  {num}人
                </option>
              ))}
            </select>
          </div>

          {/* 横持ち時に左カラム下部に表示する確定ボタン群 */}
          <div className="register-footer-landscape">
            <button
              type="button"
              onClick={handleConfirm}
              className="btn btn-emerald"
            >
              メンバーを確定してルール設定へ
            </button>
            <button
              type="button"
              onClick={onResetAllData}
              className="btn btn-dark-sub mt-2"
            >
              ⚠️ 全アプリデータを完全リセット
            </button>
          </div>
        </div>

        {/* 右カラム（縦持ち時は下段）：プレイヤー名一覧 */}
        <div className="register-right-col card">
          <label className="input-label">プレイヤー名一覧</label>
          <div id="player-inputs-container" className="player-inputs-scroll">
            {inputEntries.slice(0, memberCount).map((entry, idx) => {
              const displayId = entry.id !== null ? entry.id : idx + 1;
              return (
                <div key={idx} className="input-row">
                  <span className="no-badge">ID: {displayId}</span>
                  <input
                    type="text"
                    id={`p-input-${idx}`}
                    placeholder="プレイヤー名を入力"
                    value={entry.name}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    className="form-input"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 縦持ち時の下部固定フッター */}
      <div className="portrait-fixed-footer register-footer-portrait">
        <button
          type="button"
          onClick={handleConfirm}
          className="btn btn-emerald"
        >
          メンバーを確定してルール設定へ
        </button>
        <button
          type="button"
          onClick={onResetAllData}
          className="btn btn-dark-sub mt-2"
        >
          ⚠️ 全アプリデータを完全リセット
        </button>
      </div>
    </div>
  );
};

