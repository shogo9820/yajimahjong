import React, { useEffect, useState } from "react";
import {
  AppState,
  CustomRules,
  ManganScale,
  MatchCalcState,
  MatchHistoryEntry,
  MatchLog,
  ResultRow,
  Room,
  RoundSnapshot,
  TransferDiffItem,
  TransferModalData,
  WIND_LABELS,
} from "./types";
import { RegisterScreen } from "./components/RegisterScreen";
import { RulesScreen } from "./components/RulesScreen";
import { MatchScreen } from "./components/MatchScreen";
import { ResultScreen } from "./components/ResultScreen";
import {
  LogModal,
  StatsModal,
  TransferResultModal,
} from "./components/Modals";

const DEFAULT_RULES: CustomRules = {
  gameMode: "4",
  length: "tonan",
  points: "25000-30000",
  uma: "10-30",
  renchan: "tenpai",
  tobi: "ari",
  kuitan: "ariari",
  tieBreaker: "kamicha",
  sanmaTsumo: "tsumozon",
  sanmaNoten: "3000",
};

const INITIAL_MATCH_CALC: MatchCalcState = {
  winners: [],
  loser: null,
  type: "ron",
  scale: null,
  fu: 30,
  han: 1,
};

function createInitialState(): AppState {
  return {
    rooms: {
      デフォルトルーム: {
        roomName: "デフォルトルーム",
        gameCount: 0,
        nextPlayerId: 1,
        players: {},
        playerGames: {},
        matchHistory: [],
      },
    },
    currentRoomName: "デフォルトルーム",
    allPlayers: [],
    activePlayers: [],
    subPlayer: null,
    seatAssignments: [null, null, null, null],
    currentPoints: {},
    tableSize: 4,
    currentWind: 0,
    currentKyoku: 1,
    honbaCount: 0,
    kyotakuCount: 0,
    riichiPlayers: [],
    currentScreen: "screen-register",
    rules: { ...DEFAULT_RULES },
    matchLogs: [],
    roundHistory: [],
    lastResultRows: [],
    dice: {
      resultText: "出目: --",
      naviText: "山取り位置ナビ",
    },
  };
}

function loadStateFromStorage(): AppState {
  const base = createInitialState();
  try {
    const raw = localStorage.getItem("mj_manager_state");
    if (!raw) return base;
    const parsed = JSON.parse(raw);

    const rooms: Record<string, Room> = parsed.rooms || base.rooms;
    if (!rooms["デフォルトルーム"]) {
      rooms["デフォルトルーム"] = {
        roomName: "デフォルトルーム",
        gameCount: 0,
        nextPlayerId: 1,
        players: {},
        playerGames: {},
        matchHistory: [],
      };
    }

    Object.keys(rooms).forEach((rKey) => {
      const r = rooms[rKey];
      if (!r.players) r.players = {};
      if (!Array.isArray(r.matchHistory)) r.matchHistory = [];
      Object.keys(r.players).forEach((pKey) => {
        const p = r.players[Number(pKey)];
        if (p && !Array.isArray(p.rankCounts)) {
          p.rankCounts = [0, 0, 0, 0];
        }
      });
      if (!r.nextPlayerId) {
        const maxId = Object.keys(r.players).reduce(
          (acc, k) => Math.max(acc, Number(k) || 0),
          0
        );
        r.nextPlayerId = maxId + 1;
      }
      if (typeof r.gameCount !== "number") r.gameCount = 0;
    });

    const currentRoomName =
      parsed.currentRoomName && rooms[parsed.currentRoomName]
        ? parsed.currentRoomName
        : "デフォルトルーム";

    const rules: CustomRules = {
      ...DEFAULT_RULES,
      ...(parsed.rules || {}),
    };

    const allPlayers: number[] = Array.isArray(parsed.allPlayers)
      ? parsed.allPlayers.map((n: unknown) => Number(n))
      : [];
    const activePlayers: number[] = Array.isArray(parsed.activePlayers)
      ? parsed.activePlayers.map((n: unknown) => Number(n))
      : [];
    const subPlayer: number | null =
      parsed.subPlayer !== null && parsed.subPlayer !== undefined
        ? Number(parsed.subPlayer)
        : null;

    const renderSeatsCount =
      rules.gameMode === "4-3打ち" ? 4 : parseInt(rules.gameMode, 10) || 4;

    let seatAssignments: (number | null)[] = Array.isArray(
      parsed.seatAssignments
    )
      ? parsed.seatAssignments
      : [];

    if (seatAssignments.length === 0) {
      if (activePlayers.length > 0) {
        seatAssignments = [...activePlayers];
        if (rules.gameMode === "4-3打ち" && subPlayer !== null) {
          seatAssignments[3] = subPlayer;
        }
      } else {
        seatAssignments = new Array(renderSeatsCount).fill(null);
      }
    }

    return {
      ...base,
      rooms,
      currentRoomName,
      allPlayers,
      activePlayers,
      subPlayer,
      seatAssignments,
      currentPoints: parsed.currentPoints || {},
      tableSize: Number(parsed.tableSize) || 4,
      currentWind: Number(parsed.currentWind) || 0,
      currentKyoku: Number(parsed.currentKyoku) || 1,
      honbaCount: Number(parsed.honbaCount) || 0,
      kyotakuCount: Number(parsed.kyotakuCount) || 0,
      riichiPlayers: Array.isArray(parsed.riichiPlayers)
        ? parsed.riichiPlayers.map((n: unknown) => Number(n))
        : [],
      currentScreen: parsed.currentScreen || "screen-register",
      rules,
      matchLogs: Array.isArray(parsed.matchLogs) ? parsed.matchLogs : [],
      roundHistory: Array.isArray(parsed.roundHistory)
        ? parsed.roundHistory
        : [],
      lastResultRows: Array.isArray(parsed.lastResultRows)
        ? parsed.lastResultRows
        : [],
      dice: parsed.dice || base.dice,
    };
  } catch (e) {
    console.error("データ復元エラー。初期画面で起動します。", e);
    return base;
  }
}

function calcHandPoints(
  isWinnerOya: boolean,
  type: "ron" | "tsumo",
  scale: ManganScale,
  han: number,
  fu: number,
  tableSize: number,
  sanmaTsumo: "tsumozon" | "marutori"
): {
  pointsWinnerGets: number;
  pointsOyaPays: number;
  pointsKoPays: number;
} {
  let pointsWinnerGets = 0;
  let pointsOyaPays = 0;
  let pointsKoPays = 0;

  const isManganOrAbove =
    scale !== null ||
    (han === 3 && fu >= 60) ||
    (han === 4 && fu >= 30) ||
    han >= 5;

  if (isManganOrAbove) {
    const effScale = scale || "mangan";
    if (effScale === "mangan") pointsWinnerGets = isWinnerOya ? 12000 : 8000;
    else if (effScale === "hanman")
      pointsWinnerGets = isWinnerOya ? 18000 : 12000;
    else if (effScale === "baiman")
      pointsWinnerGets = isWinnerOya ? 24000 : 16000;
    else if (effScale === "sanbaiman")
      pointsWinnerGets = isWinnerOya ? 36000 : 24000;
    else if (effScale === "yakuman")
      pointsWinnerGets = isWinnerOya ? 48000 : 32000;
    else if (effScale === "double_yakuman")
      pointsWinnerGets = isWinnerOya ? 96000 : 64000;

    if (type === "tsumo") {
      if (tableSize === 4) {
        if (isWinnerOya) {
          pointsKoPays = pointsWinnerGets / 3;
        } else {
          pointsOyaPays = pointsWinnerGets / 2;
          pointsKoPays = pointsWinnerGets / 4;
        }
      } else {
        // 3人麻雀
        if (sanmaTsumo === "marutori") {
          // ツモ損なし（北家分を折半・100点切り上げ）
          if (isWinnerOya) {
            pointsKoPays = Math.ceil(pointsWinnerGets / 2 / 100) * 100;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            const baseOya = pointsWinnerGets / 2;
            const baseKo = pointsWinnerGets / 4;
            const northHalf = Math.ceil(baseKo / 2 / 100) * 100;
            pointsOyaPays = baseOya + northHalf;
            pointsKoPays = baseKo + northHalf;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        } else {
          // ツモ損あり
          if (isWinnerOya) {
            pointsKoPays = pointsWinnerGets / 3;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            pointsOyaPays = pointsWinnerGets / 2;
            pointsKoPays = pointsWinnerGets / 4;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        }
      }
    }
  } else {
    const baseScore = fu * Math.pow(2, han + 2);
    if (type === "ron") {
      const rawScore = isWinnerOya ? baseScore * 6 : baseScore * 4;
      pointsWinnerGets = Math.ceil(rawScore / 100) * 100;
    } else {
      const stdOyaPay = Math.ceil((baseScore * 4) / 100) * 100;
      const stdKoPay = Math.ceil((baseScore * 2) / 100) * 100;
      if (tableSize === 4) {
        if (isWinnerOya) {
          pointsKoPays = stdKoPay;
          pointsWinnerGets = pointsKoPays * 3;
        } else {
          pointsOyaPays = stdOyaPay;
          pointsKoPays = stdKoPay;
          pointsWinnerGets = pointsOyaPays + pointsKoPays * 2;
        }
      } else {
        // 3人麻雀
        if (sanmaTsumo === "marutori") {
          if (isWinnerOya) {
            const total4P = stdKoPay * 3;
            pointsKoPays = Math.ceil(total4P / 2 / 100) * 100;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            const northHalf = Math.ceil(stdKoPay / 2 / 100) * 100;
            pointsOyaPays = stdOyaPay + northHalf;
            pointsKoPays = stdKoPay + northHalf;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        } else {
          if (isWinnerOya) {
            pointsKoPays = stdKoPay;
            pointsWinnerGets = pointsKoPays * 2;
          } else {
            pointsOyaPays = stdOyaPay;
            pointsKoPays = stdKoPay;
            pointsWinnerGets = pointsOyaPays + pointsKoPays;
          }
        }
      }
    }
  }

  return { pointsWinnerGets, pointsOyaPays, pointsKoPays };
}

export const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(() =>
    loadStateFromStorage()
  );
  const [matchCalc, setMatchCalc] =
    useState<MatchCalcState>(INITIAL_MATCH_CALC);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [transferModal, setTransferModal] = useState<TransferModalData>({
    isOpen: false,
    title: "",
    subtitle: "",
    diffList: [],
    extraInfo: "",
    isTobiEnd: false,
    isRenchan: false,
    isAllLastEnd: false,
    canAgariYame: false,
    isSameKyokuRetry: false,
  });

  useEffect(() => {
    try {
      localStorage.setItem("mj_manager_state", JSON.stringify(appState));
    } catch (e) {
      console.error("LocalStorage保存エラー", e);
    }
  }, [appState]);

  const getPlayerName = (id: number): string => {
    const room = appState.rooms[appState.currentRoomName];
    if (room && room.players && room.players[id]) {
      return room.players[id].name;
    }
    return "未知のメンツ";
  };

  const createRoundSnapshot = (state: AppState): RoundSnapshot => ({
    activePlayers: [...state.activePlayers],
    subPlayer: state.subPlayer,
    currentPoints: { ...state.currentPoints },
    currentWind: state.currentWind,
    currentKyoku: state.currentKyoku,
    honbaCount: state.honbaCount,
    kyotakuCount: state.kyotakuCount,
    riichiPlayers: [...state.riichiPlayers],
    matchLogs: state.matchLogs.map((l) => ({
      ...l,
      rows: l.rows.map((r) => ({ ...r })),
    })),
  });

  // ==========================================
  // 1. メンバー登録・ルーム管理ハンドラ
  // ==========================================
  const handleSelectRoom = (roomName: string) => {
    setAppState((prev) => ({
      ...prev,
      currentRoomName: roomName,
    }));
  };

  const handleCreateRoom = (roomName: string) => {
    setAppState((prev) => {
      const nextRooms = { ...prev.rooms };
      if (!nextRooms[roomName]) {
        nextRooms[roomName] = {
          roomName,
          gameCount: 0,
          nextPlayerId: 1,
          players: {},
          playerGames: {},
          matchHistory: [],
        };
      }
      return {
        ...prev,
        rooms: nextRooms,
        currentRoomName: roomName,
      };
    });
  };

  const handleDeleteCurrentRoom = () => {
    const rName = appState.currentRoomName;
    if (rName === "デフォルトルーム") {
      alert(
        "「デフォルトルーム」は削除できません。自分で作成したルームを削除してください。"
      );
      return;
    }
    if (
      window.confirm(
        `本当にルーム「${rName}」を削除しますか？\nこのグループに保存されているメンバーの名前、これまでの全成績が完全に消去されます。`
      )
    ) {
      setAppState((prev) => {
        const nextRooms = { ...prev.rooms };
        delete nextRooms[rName];
        return {
          ...prev,
          rooms: nextRooms,
          currentRoomName: "デフォルトルーム",
          allPlayers: [],
        };
      });
      alert(`ルーム「${rName}」を削除しました。`);
    }
  };

  const handleSubmitRegistration = (
    entries: { id: number | null; name: string }[],
    newRoomName?: string
  ) => {
    const targetRoomName =
      newRoomName?.trim() || appState.currentRoomName || "デフォルトルーム";
    const existingRoom = appState.rooms[targetRoomName] || {
      roomName: targetRoomName,
      gameCount: 0,
      nextPlayerId: 1,
      players: {},
      playerGames: {},
      matchHistory: [],
    };

    const updatedPlayers = { ...existingRoom.players };
    let nextId = existingRoom.nextPlayerId || 1;
    const registeredIds: number[] = [];

    entries.forEach((entry) => {
      const trimmed = entry.name.trim();
      if (!trimmed) return;
      if (entry.id !== null && updatedPlayers[entry.id]) {
        updatedPlayers[entry.id] = {
          ...updatedPlayers[entry.id],
          name: trimmed,
        };
        registeredIds.push(entry.id);
      } else {
        const newId = nextId++;
        updatedPlayers[newId] = {
          id: newId,
          name: trimmed,
          totalGames: 0,
          points: 0,
          rankCounts: [0, 0, 0, 0],
        };
        registeredIds.push(newId);
      }
    });

    if (registeredIds.length < 3) {
      alert("対局には最低3人以上のメンバーが必要です");
      return;
    }

    const renderSeatsCount =
      appState.rules.gameMode === "4-3打ち"
        ? 4
        : parseInt(appState.rules.gameMode, 10);

    const nextSeats: (number | null)[] = [];
    for (let i = 0; i < renderSeatsCount; i++) {
      const prevId = appState.seatAssignments[i] ?? null;
      nextSeats.push(
        prevId !== null && registeredIds.includes(prevId) ? prevId : null
      );
    }

    setAppState((prev) => ({
      ...prev,
      rooms: {
        ...prev.rooms,
        [targetRoomName]: {
          ...existingRoom,
          roomName: targetRoomName,
          nextPlayerId: nextId,
          players: updatedPlayers,
        },
      },
      currentRoomName: targetRoomName,
      allPlayers: registeredIds,
      seatAssignments: nextSeats,
      currentScreen: "screen-rules",
    }));
  };

  const handleResetAllData = () => {
    if (
      window.confirm(
        "これまでの累積名簿や全ルーム成績を含むすべてのデータを完全にリセットしますか？"
      )
    ) {
      localStorage.removeItem("mj_manager_state");
      setAppState(createInitialState());
      setMatchCalc(INITIAL_MATCH_CALC);
    }
  };

  // ==========================================
  // 2. ルール・卓設定ハンドラ
  // ==========================================
  const handleUpdateRules = (partial: Partial<CustomRules>) => {
    setAppState((prev) => {
      const nextRules = { ...prev.rules, ...partial };
      const nextTableSize =
        nextRules.gameMode === "4-3打ち"
          ? 3
          : parseInt(nextRules.gameMode, 10) || 4;
      return {
        ...prev,
        rules: nextRules,
        tableSize: nextTableSize,
      };
    });
  };

  const handleUpdateSeats = (newSeats: (number | null)[]) => {
    setAppState((prev) => ({
      ...prev,
      seatAssignments: newSeats,
    }));
  };

  const handleStartMatch = () => {
    const modeVal = appState.rules.gameMode;
    const activePlayers: number[] = [];
    let subPlayer: number | null = null;
    let tableSize = 4;

    if (modeVal === "4-3打ち") {
      tableSize = 3;
      for (let i = 0; i < 3; i++) {
        const pId = appState.seatAssignments[i] ?? null;
        if (pId === null) {
          alert(`${WIND_LABELS[i]}家の席にプレイヤーを配置してください。`);
          return;
        }
        activePlayers.push(pId);
      }
      const subId = appState.seatAssignments[3] ?? null;
      if (subId === null) {
        alert("控えの席に4人目のプレイヤーを配置してください。");
        return;
      }
      subPlayer = subId;
    } else {
      tableSize = parseInt(modeVal, 10) || 4;
      for (let i = 0; i < tableSize; i++) {
        const pId = appState.seatAssignments[i] ?? null;
        if (pId === null) {
          alert(`${WIND_LABELS[i]}家の席にプレイヤーを配置してください。`);
          return;
        }
        activePlayers.push(pId);
      }
    }

    const startPoints =
      parseInt(appState.rules.points.split("-")[0], 10) || 25000;
    const currentPoints: Record<number, number> = {};
    activePlayers.forEach((pId) => {
      currentPoints[pId] = startPoints;
    });
    if (subPlayer !== null) {
      currentPoints[subPlayer] = startPoints;
    }

    setMatchCalc(INITIAL_MATCH_CALC);
    setAppState((prev) => ({
      ...prev,
      activePlayers,
      subPlayer,
      tableSize,
      currentPoints,
      currentWind: 0,
      currentKyoku: 1,
      honbaCount: 0,
      kyotakuCount: 0,
      riichiPlayers: [],
      matchLogs: [],
      roundHistory: [],
      dice: {
        resultText: "出目: --",
        naviText: "山取り位置ナビ",
      },
      currentScreen: "screen-match",
    }));
  };

  // ==========================================
  // 3. 対局中ハンドラ
  // ==========================================
  const handleRollDice = () => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const sum = d1 + d2;
    const resultText = `出目: ${sum} (${d1}, ${d2})`;

    let targetWind = "";
    if ([5, 9].includes(sum)) targetWind = "東家(自家)";
    else if ([2, 6, 10].includes(sum)) targetWind = "南家(右面)";
    else if ([3, 7, 11].includes(sum)) targetWind = "西家(対面)";
    else if ([4, 8, 12].includes(sum)) targetWind = "北家(左面)";

    const naviText = `${targetWind}の山、右から${sum}列残して開門`;

    setAppState((prev) => ({
      ...prev,
      dice: { resultText, naviText },
    }));
  };

  // 立直の宣言・取り消しトグル機能
  const handleToggleRiichi = (playerId: number) => {
    if (appState.riichiPlayers.includes(playerId)) {
      // 立直の取り消し（1,000点返却＆供託-1）
      setAppState((prev) => ({
        ...prev,
        currentPoints: {
          ...prev.currentPoints,
          [playerId]: (prev.currentPoints[playerId] ?? 0) + 1000,
        },
        kyotakuCount: Math.max(0, prev.kyotakuCount - 1),
        riichiPlayers: prev.riichiPlayers.filter((id) => id !== playerId),
      }));

      setMatchCalc((prev) => {
        if (prev.type === "tenpai") {
          return {
            ...prev,
            winners: prev.winners.filter((id) => id !== playerId),
          };
        }
        return prev;
      });
      return;
    }

    const currentPt = appState.currentPoints[playerId] ?? 0;
    if (currentPt < 1000) {
      alert(
        "持ち点が1,000点未満のため立直できません（仕様Aにより1,000点あれば立直して0点続行が可能です）"
      );
      return;
    }

    setAppState((prev) => ({
      ...prev,
      currentPoints: {
        ...prev.currentPoints,
        [playerId]: (prev.currentPoints[playerId] ?? 0) - 1000,
      },
      kyotakuCount: prev.kyotakuCount + 1,
      riichiPlayers: [...prev.riichiPlayers, playerId],
    }));

    setMatchCalc((prev) => {
      if (prev.type === "tenpai" && !prev.winners.includes(playerId)) {
        return {
          ...prev,
          winners: [...prev.winners, playerId],
        };
      }
      return prev;
    });
  };

  const handleManualScoreChange = (playerId: number, score: number) => {
    setAppState((prev) => ({
      ...prev,
      currentPoints: {
        ...prev.currentPoints,
        [playerId]: score,
      },
    }));
  };

  const handleUpdateMatchCalc = (partial: Partial<MatchCalcState>) => {
    setMatchCalc((prev) => ({ ...prev, ...partial }));
  };

  const handleClearRoleSlots = () => {
    setMatchCalc(INITIAL_MATCH_CALC);
  };

  // 1局前の状態に戻す（Undo）
  const handleUndoLastRound = () => {
    if (appState.roundHistory.length === 0) return;
    const lastSnap = appState.roundHistory[appState.roundHistory.length - 1];
    if (
      !window.confirm(
        "直前の局の精算を取り消して、1局前の状態に戻しますか？"
      )
    ) {
      return;
    }

    setAppState((prev) => ({
      ...prev,
      activePlayers: lastSnap.activePlayers,
      subPlayer: lastSnap.subPlayer,
      currentPoints: lastSnap.currentPoints,
      currentWind: lastSnap.currentWind,
      currentKyoku: lastSnap.currentKyoku,
      honbaCount: lastSnap.honbaCount,
      kyotakuCount: lastSnap.kyotakuCount,
      riichiPlayers: lastSnap.riichiPlayers,
      matchLogs: lastSnap.matchLogs,
      roundHistory: prev.roundHistory.slice(0, -1),
    }));
    setMatchCalc(INITIAL_MATCH_CALC);
    setIsLogOpen(false);
  };

  // 終局精算処理（残った供託のトップ取り ＆ 同点時折半対応 ＆ 着順履歴保存）
  const finalizeEndMatch = (
    pointsSnapshot: Record<number, number>,
    logsSnapshot: MatchLog[],
    remainingKyotaku: number
  ) => {
    const tableSize = appState.tableSize;
    const finalPoints = { ...pointsSnapshot };
    const finalLogs = [...logsSnapshot];

    const currentScores: { id: number; score: number; index: number }[] = [];
    for (let i = 0; i < tableSize; i++) {
      const pId = appState.activePlayers[i];
      const score = finalPoints[pId] ?? 0;
      currentScores.push({ id: pId, score, index: i });
    }
    currentScores.sort((a, b) => b.score - a.score || a.index - b.index);

    // 残っている供託棒を1位（トップ）が獲得
    if (remainingKyotaku > 0 && currentScores.length > 0) {
      const topPlayerId = currentScores[0].id;
      const kyotakuBonus = remainingKyotaku * 1000;
      currentScores[0].score += kyotakuBonus;
      finalPoints[topPlayerId] = (finalPoints[topPlayerId] ?? 0) + kyotakuBonus;
      finalLogs.push({
        title: "終局時 残供託回収",
        rows: [
          {
            type: "トップ取",
            name: getPlayerName(topPlayerId),
            pt: kyotakuBonus,
          },
        ],
        isTobiEnd: false,
        tobiPlayer: "",
      });
    }

    const parts = appState.rules.points.split("-");
    const startPoints = parseInt(parts[0], 10) || 25000;
    const baseReturn = parseInt(parts[1], 10) || 30000;

    const is3P = tableSize === 3;
    const numPlayers = is3P ? 3 : 4;
    const oka = ((baseReturn - startPoints) * numPlayers) / 1000;

    const umaRule = appState.rules.uma;
    let uma = is3P ? [10, 0, -10] : [20, 10, -10, -20];
    if (umaRule === "10-30") uma = is3P ? [20, 0, -20] : [30, 10, -10, -30];
    if (umaRule === "10-20") uma = is3P ? [10, 0, -10] : [20, 10, -10, -20];
    if (umaRule === "none") uma = is3P ? [0, 0, 0] : [0, 0, 0, 0];

    const rankBonuses = uma.map((u, idx) => u + (idx === 0 ? oka : 0));

    // 同点時折半対応
    const effectiveBonuses = [...rankBonuses];
    if (appState.rules.tieBreaker === "split") {
      let i = 0;
      while (i < currentScores.length) {
        let j = i;
        while (
          j + 1 < currentScores.length &&
          currentScores[j + 1].score === currentScores[i].score
        ) {
          j++;
        }
        if (j > i) {
          let sumBonus = 0;
          for (let k = i; k <= j; k++) sumBonus += rankBonuses[k];
          const avgBonus = sumBonus / (j - i + 1);
          for (let k = i; k <= j; k++) effectiveBonuses[k] = avgBonus;
        }
        i = j + 1;
      }
    }

    const calculatedRows: ResultRow[] = [];
    const room = appState.rooms[appState.currentRoomName];
    const updatedPlayers = { ...(room?.players || {}) };
    const historyResults: MatchHistoryEntry["results"] = [];

    currentScores.forEach((item, rank) => {
      const rawPt = (item.score - baseReturn) / 1000;
      const roundedPt =
        appState.rules.tieBreaker === "split"
          ? Math.round(rawPt * 10) / 10
          : Math.round(rawPt);
      const finalPt =
        Math.round((roundedPt + effectiveBonuses[rank]) * 10) / 10;

      calculatedRows.push({
        rank: rank + 1,
        name: getPlayerName(item.id),
        score: item.score,
        pt: finalPt,
      });

      historyResults.push({
        playerId: item.id,
        name: getPlayerName(item.id),
        rank: rank + 1,
        score: item.score,
        pt: finalPt,
      });

      if (updatedPlayers[item.id]) {
        const prevPlayer = updatedPlayers[item.id];
        const nextRankCounts: [number, number, number, number] = [
          ...(prevPlayer.rankCounts || [0, 0, 0, 0]),
        ];
        if (rank >= 0 && rank < 4) {
          nextRankCounts[rank] = (nextRankCounts[rank] || 0) + 1;
        }
        updatedPlayers[item.id] = {
          ...prevPlayer,
          points: Math.round(((prevPlayer.points || 0) + finalPt) * 10) / 10,
          totalGames: (prevPlayer.totalGames || 0) + 1,
          rankCounts: nextRankCounts,
        };
      }
    });

    const newHistoryEntry: MatchHistoryEntry = {
      id: `${Date.now()}`,
      timestamp: new Date().toLocaleString("ja-JP"),
      results: historyResults,
    };

    setAppState((prev) => {
      const prevRoom = prev.rooms[prev.currentRoomName];
      return {
        ...prev,
        currentPoints: finalPoints,
        kyotakuCount: 0,
        matchLogs: finalLogs,
        rooms: {
          ...prev.rooms,
          [prev.currentRoomName]: {
            ...prevRoom,
            gameCount: (prevRoom?.gameCount || 0) + 1,
            players: updatedPlayers,
            matchHistory: [...(prevRoom?.matchHistory || []), newHistoryEntry],
          },
        },
        lastResultRows: calculatedRows,
        currentScreen: "screen-result",
      };
    });
  };

  // 直前の半荘成績を取り消す
  const handleUndoLastMatchStats = () => {
    const room = appState.rooms[appState.currentRoomName];
    if (
      !room ||
      !Array.isArray(room.matchHistory) ||
      room.matchHistory.length === 0
    ) {
      return;
    }
    const lastEntry = room.matchHistory[room.matchHistory.length - 1];
    if (
      !window.confirm(
        `直前の半荘成績（${lastEntry.timestamp}）を総合成績表から取り消しますか？`
      )
    ) {
      return;
    }

    setAppState((prev) => {
      const currentRoom = prev.rooms[prev.currentRoomName];
      if (!currentRoom || !currentRoom.matchHistory?.length) return prev;
      const popped =
        currentRoom.matchHistory[currentRoom.matchHistory.length - 1];
      const updatedPlayers = { ...currentRoom.players };

      popped.results.forEach((res) => {
        const p = updatedPlayers[res.playerId];
        if (p) {
          const nextRc: [number, number, number, number] = [
            ...(p.rankCounts || [0, 0, 0, 0]),
          ];
          const rIdx = res.rank - 1;
          if (rIdx >= 0 && rIdx < 4) {
            nextRc[rIdx] = Math.max(0, (nextRc[rIdx] || 0) - 1);
          }
          updatedPlayers[res.playerId] = {
            ...p,
            points: Math.round(((p.points || 0) - res.pt) * 10) / 10,
            totalGames: Math.max(0, (p.totalGames || 0) - 1),
            rankCounts: nextRc,
          };
        }
      });

      return {
        ...prev,
        rooms: {
          ...prev.rooms,
          [prev.currentRoomName]: {
            ...currentRoom,
            gameCount: Math.max(0, (currentRoom.gameCount || 0) - 1),
            players: updatedPlayers,
            matchHistory: currentRoom.matchHistory.slice(0, -1),
          },
        },
      };
    });
  };

  // オーラス・アガリ止め判定ヘルパー
  const evaluateAllLastStatus = (
    isRenchan: boolean,
    nextPoints: Record<number, number>
  ): { isAllLastEnd: boolean; canAgariYame: boolean } => {
    const targetMaxWind = appState.rules.length === "tonpu" ? 0 : 1;
    const maxKyoku = appState.tableSize === 3 ? 3 : 4;
    const isAllLastRound =
      appState.currentWind >= targetMaxWind &&
      appState.currentKyoku === maxKyoku;

    if (!isAllLastRound) {
      return { isAllLastEnd: false, canAgariYame: false };
    }

    if (!isRenchan) {
      return { isAllLastEnd: true, canAgariYame: false };
    }

    // オーラスで親が連荘した場合、親がトップ（単独1位）ならアガリ止め／聴牌止めを選択可能にする
    const oyaSeatIndex = (appState.currentKyoku - 1) % appState.tableSize;
    const currentOyaId = appState.activePlayers[oyaSeatIndex];
    const oyaScore = nextPoints[currentOyaId] ?? 0;

    let isOyaTop = true;
    for (let i = 0; i < appState.tableSize; i++) {
      const pId = appState.activePlayers[i];
      if (pId !== currentOyaId && (nextPoints[pId] ?? 0) >= oyaScore) {
        isOyaTop = false;
        break;
      }
    }

    return { isAllLastEnd: false, canAgariYame: isOyaTop };
  };

  // 途中流局（九種九牌・四風連打など）
  const handleExecuteAbortiveDraw = (isRenchan: boolean) => {
    const snapshot = createRoundSnapshot(appState);
    const windStr = WIND_LABELS[appState.currentWind] || "東";
    const nextHonba = appState.honbaCount + 1;

    const currentLogObj: MatchLog = {
      title: `${windStr}${appState.currentKyoku}局　${appState.honbaCount}本場`,
      rows: appState.activePlayers
        .slice(0, appState.tableSize)
        .map((pId) => ({
          type: "途中流局",
          name: getPlayerName(pId),
          pt: 0,
        })),
      isTobiEnd: false,
      tobiPlayer: "",
    };

    const diffList: TransferDiffItem[] = appState.activePlayers
      .slice(0, appState.tableSize)
      .map((pId) => ({
        name: getPlayerName(pId),
        diff: 0,
      }));

    const { isAllLastEnd, canAgariYame } = evaluateAllLastStatus(
      isRenchan,
      appState.currentPoints
    );

    setAppState((prev) => ({
      ...prev,
      honbaCount: nextHonba,
      matchLogs: [...prev.matchLogs, currentLogObj],
      roundHistory: [...prev.roundHistory, snapshot],
    }));

    setTransferModal({
      isOpen: true,
      title: `${windStr}${appState.currentKyoku}局 ${appState.honbaCount}本場 精算`,
      subtitle: `途中流局（${isRenchan ? "親連荘" : "親流れ"}）`,
      diffList,
      extraInfo: `点数移動なし / 本場+1 ➔ ${nextHonba}本場（供託維持）`,
      isTobiEnd: false,
      isRenchan,
      isAllLastEnd,
      canAgariYame,
      isSameKyokuRetry: false,
    });
  };

  // チョンボ（錯和・満貫払い・同局やり直し）
  const handleExecuteChombo = () => {
    if (matchCalc.winners.length === 0) {
      alert("🚨 チョンボ者の枠に対象プレイヤーをドロップ（またはタップ）してください");
      return;
    }

    const offenderId = matchCalc.winners[0];
    const snapshot = createRoundSnapshot(appState);
    const tableSize = appState.tableSize;
    const oyaSeatIndex = (appState.currentKyoku - 1) % tableSize;
    const currentOyaId = appState.activePlayers[oyaSeatIndex];
    const isOffenderOya = offenderId === currentOyaId;

    const nextPoints = { ...appState.currentPoints };
    let nextKyotaku = appState.kyotakuCount;

    // この局に出された立直棒は各自へ返却
    appState.riichiPlayers.forEach((rPid) => {
      nextPoints[rPid] = (nextPoints[rPid] ?? 0) + 1000;
      nextKyotaku = Math.max(0, nextKyotaku - 1);
    });

    const windStr = WIND_LABELS[appState.currentWind] || "東";
    const currentLogObj: MatchLog = {
      title: `${windStr}${appState.currentKyoku}局　${appState.honbaCount}本場 (チョンボ)`,
      rows: [],
      isTobiEnd: false,
      tobiPlayer: "",
    };

    const diffList: TransferDiffItem[] = [];
    let totalPenalty = 0;

    appState.activePlayers.slice(0, tableSize).forEach((pId) => {
      if (pId === offenderId) return;
      const recv = isOffenderOya ? 4000 : pId === currentOyaId ? 4000 : 2000;
      totalPenalty += recv;
      nextPoints[pId] = (nextPoints[pId] ?? 0) + recv;
      currentLogObj.rows.push({
        type: "罰符受取",
        name: getPlayerName(pId),
        pt: recv,
      });
      diffList.push({ name: getPlayerName(pId), diff: recv });
    });

    nextPoints[offenderId] = (nextPoints[offenderId] ?? 0) - totalPenalty;
    currentLogObj.rows.unshift({
      type: "チョンボ",
      name: getPlayerName(offenderId),
      pt: -totalPenalty,
    });
    diffList.unshift({ name: getPlayerName(offenderId), diff: -totalPenalty });

    setAppState((prev) => ({
      ...prev,
      currentPoints: nextPoints,
      kyotakuCount: nextKyotaku,
      riichiPlayers: [],
      matchLogs: [...prev.matchLogs, currentLogObj],
      roundHistory: [...prev.roundHistory, snapshot],
    }));

    setTransferModal({
      isOpen: true,
      title: `${windStr}${appState.currentKyoku}局 ${appState.honbaCount}本場 チョンボ精算`,
      subtitle: `🚨 チョンボ（満貫払い）`,
      diffList,
      extraInfo:
        "当局の立直棒は返却され、本場据え置きで同じ局をやり直します。",
      isTobiEnd: false,
      isRenchan: true,
      isAllLastEnd: false,
      canAgariYame: false,
      isSameKyokuRetry: true,
    });
  };

  // 通常精算（ロン・ダブロン・ツモ・流局聴牌）
  const handleExecutePointTransfer = () => {
    if (matchCalc.type !== "tenpai" && matchCalc.winners.length === 0) {
      alert("和了者(アガリ)を設定してください");
      return;
    }
    if (matchCalc.type === "ron" && matchCalc.loser === null) {
      alert("ロンの場合は放銃者を設定してください");
      return;
    }

    const snapshot = createRoundSnapshot(appState);
    const tableSize = appState.tableSize;
    const oyaSeatIndex = (appState.currentKyoku - 1) % tableSize;
    const currentOyaId = appState.activePlayers[oyaSeatIndex];
    const windStr = WIND_LABELS[appState.currentWind] || "東";
    let isRenchan = false;

    const currentHonba = appState.honbaCount;
    const honbaRonValue = currentHonba * 300;
    const honbaTsumoValue = currentHonba * 100;

    const nextPoints = { ...appState.currentPoints };
    let nextHonba = appState.honbaCount;
    let nextKyotaku = appState.kyotakuCount;

    const currentLogObj: MatchLog = {
      title: `${windStr}${appState.currentKyoku}局　${currentHonba}本場`,
      rows: [],
      isTobiEnd: false,
      tobiPlayer: "",
    };

    let modalSubtitle = "";
    let modalExtraInfo = "";
    const diffList: TransferDiffItem[] = [];

    if (matchCalc.type === "tenpai") {
      modalSubtitle = "荒牌流局（ノーテン罰符）";
      const tenpaiCount = matchCalc.winners.length;
      const allActive = appState.activePlayers.slice(0, tableSize);
      const noTenCount = allActive.length - tenpaiCount;

      const totalPool =
        tableSize === 3 && appState.rules.sanmaNoten === "2000" ? 2000 : 3000;

      if (tenpaiCount > 0 && noTenCount > 0) {
        const plusScore = totalPool / tenpaiCount;
        const minusScore = totalPool / noTenCount;

        allActive.forEach((pId) => {
          if (matchCalc.winners.includes(pId)) {
            nextPoints[pId] = (nextPoints[pId] ?? 0) + plusScore;
            currentLogObj.rows.push({
              type: "荒牌　　",
              name: getPlayerName(pId),
              pt: plusScore,
            });
            diffList.push({ name: getPlayerName(pId), diff: plusScore });
          } else {
            nextPoints[pId] = (nextPoints[pId] ?? 0) - minusScore;
            currentLogObj.rows.push({
              type: "　　　　",
              name: getPlayerName(pId),
              pt: -minusScore,
            });
            diffList.push({ name: getPlayerName(pId), diff: -minusScore });
          }
        });
      } else {
        allActive.forEach((pId) => {
          currentLogObj.rows.push({
            type: "荒牌　　",
            name: getPlayerName(pId),
            pt: 0,
          });
          diffList.push({ name: getPlayerName(pId), diff: 0 });
        });
        modalExtraInfo = "全員聴牌、または全員不聴（点数移動なし）";
      }

      isRenchan =
        appState.rules.renchan === "tenpai" &&
        matchCalc.winners.includes(currentOyaId);
      nextHonba += 1;
      modalExtraInfo +=
        (modalExtraInfo ? "<br>" : "") +
        `本場を+1します（現在: ${nextHonba}本場）`;
    } else if (matchCalc.type === "ron" && matchCalc.loser !== null) {
      // ロン和了（シングルロン ＆ ダブロン対応）
      const loserId = matchCalc.loser;
      const loserSeatIdx = appState.activePlayers.indexOf(loserId);

      // 放銃者からツモ巡目（反時計回り）で最も近い和了者（頭ハネ・上家取り）を特定
      const sortedWinners = [...matchCalc.winners].sort((a, b) => {
        const seatA = appState.activePlayers.indexOf(a);
        const seatB = appState.activePlayers.indexOf(b);
        const distA = (seatA - loserSeatIdx + tableSize) % tableSize;
        const distB = (seatB - loserSeatIdx + tableSize) % tableSize;
        return distA - distB;
      });

      const scaleNames: Record<string, string> = {
        mangan: "満貫",
        hanman: "跳満",
        baiman: "倍満",
        sanbaiman: "三倍満",
        yakuman: "役満",
        double_yakuman: "W役満",
      };
      const handLabel = matchCalc.scale
        ? scaleNames[matchCalc.scale]
        : `${matchCalc.han}翻 ${matchCalc.fu}符`;

      modalSubtitle =
        sortedWinners.length >= 2
          ? `ダブロン和了（${sortedWinners.length}名 / ${handLabel}）`
          : `ロン和了（${handLabel}）`;

      let totalLoserPays = 0;

      sortedWinners.forEach((wId, idx) => {
        const isWinnerOya = wId === currentOyaId;
        const { pointsWinnerGets } = calcHandPoints(
          isWinnerOya,
          "ron",
          matchCalc.scale,
          matchCalc.han,
          matchCalc.fu,
          tableSize,
          appState.rules.sanmaTsumo
        );

        // 積み棒（本場）は上家（1人目）に加算
        const honbaAdd = idx === 0 ? honbaRonValue : 0;
        const kPt = idx === 0 ? nextKyotaku * 1000 : 0;
        const finalGet = pointsWinnerGets + honbaAdd;

        totalLoserPays += finalGet;
        nextPoints[wId] = (nextPoints[wId] ?? 0) + finalGet + kPt;

        currentLogObj.rows.push({
          type: "ロン和　",
          name: getPlayerName(wId),
          pt: finalGet,
        });
        if (kPt > 0) {
          currentLogObj.rows.push({
            type: "供託回収",
            name: getPlayerName(wId),
            pt: kPt,
          });
          modalExtraInfo += `供託棒 ${nextKyotaku}本（+${kPt.toLocaleString()}点）を${getPlayerName(
            wId
          )}が獲得<br>`;
        }
        diffList.push({ name: getPlayerName(wId), diff: finalGet + kPt });
      });

      nextKyotaku = 0;
      nextPoints[loserId] = (nextPoints[loserId] ?? 0) - totalLoserPays;
      currentLogObj.rows.push({
        type: "放銃　　",
        name: getPlayerName(loserId),
        pt: -totalLoserPays,
      });
      diffList.push({ name: getPlayerName(loserId), diff: -totalLoserPays });

      if (sortedWinners.includes(currentOyaId)) {
        isRenchan = true;
        nextHonba += 1;
        modalExtraInfo += `親の和了（連荘）本場+1 ➔ ${nextHonba}本場`;
      } else {
        isRenchan = false;
        nextHonba = 0;
        modalExtraInfo += `子のアガリ（本場リセット ➔ 0本場）`;
      }
    } else {
      // ツモ和了
      const winnerId = matchCalc.winners[0];
      const isWinnerOya = currentOyaId === winnerId;
      const scaleNames: Record<string, string> = {
        mangan: "満貫",
        hanman: "跳満",
        baiman: "倍満",
        sanbaiman: "三倍満",
        yakuman: "役満",
        double_yakuman: "W役満",
      };
      const handLabel = matchCalc.scale
        ? scaleNames[matchCalc.scale]
        : `${matchCalc.han}翻 ${matchCalc.fu}符`;
      modalSubtitle = `ツモ和了（${handLabel}）`;

      const { pointsWinnerGets, pointsOyaPays, pointsKoPays } = calcHandPoints(
        isWinnerOya,
        "tsumo",
        matchCalc.scale,
        matchCalc.han,
        matchCalc.fu,
        tableSize,
        appState.rules.sanmaTsumo
      );

      const finalGet =
        pointsWinnerGets + (tableSize - 1) * honbaTsumoValue;
      const kPt = nextKyotaku * 1000;

      nextPoints[winnerId] = (nextPoints[winnerId] ?? 0) + finalGet + kPt;
      currentLogObj.rows.push({
        type: "ツモ和　",
        name: getPlayerName(winnerId),
        pt: finalGet,
      });
      if (kPt > 0) {
        currentLogObj.rows.push({
          type: "供託回収",
          name: getPlayerName(winnerId),
          pt: kPt,
        });
        modalExtraInfo += `供託棒 ${nextKyotaku}本（+${kPt.toLocaleString()}点）を獲得<br>`;
        nextKyotaku = 0;
      }
      diffList.push({ name: getPlayerName(winnerId), diff: finalGet + kPt });

      appState.activePlayers.slice(0, tableSize).forEach((pId) => {
        if (pId === winnerId) return;
        const loss =
          (currentOyaId === pId ? pointsOyaPays : pointsKoPays) +
          honbaTsumoValue;
        nextPoints[pId] = (nextPoints[pId] ?? 0) - loss;
        currentLogObj.rows.push({
          type: "　　　　",
          name: getPlayerName(pId),
          pt: -loss,
        });
        diffList.push({ name: getPlayerName(pId), diff: -loss });
      });

      if (isWinnerOya) {
        isRenchan = true;
        nextHonba += 1;
        modalExtraInfo += `親の和了（連荘）本場+1 ➔ ${nextHonba}本場`;
      } else {
        isRenchan = false;
        nextHonba = 0;
        modalExtraInfo += `子のアガリ（本場リセット ➔ 0本場）`;
      }
    }

    // 飛び判定
    let hasTobiPlayer = false;
    let tobiPlayerName = "";
    appState.activePlayers.slice(0, tableSize).forEach((pId) => {
      if ((nextPoints[pId] ?? 0) < 0) {
        hasTobiPlayer = true;
        tobiPlayerName = getPlayerName(pId);
      }
    });

    const isTobiEnd = appState.rules.tobi === "ari" && hasTobiPlayer;
    if (isTobiEnd) {
      currentLogObj.isTobiEnd = true;
      currentLogObj.tobiPlayer = tobiPlayerName;
      modalExtraInfo += `<br><span style="color:#f43f5e;font-weight:bold;">🚨 ぶっ飛び：${tobiPlayerName}が0点未満のためコールド終局</span>`;
    }

    const { isAllLastEnd, canAgariYame } = isTobiEnd
      ? { isAllLastEnd: false, canAgariYame: false }
      : evaluateAllLastStatus(isRenchan, nextPoints);

    if (isAllLastEnd) {
      modalExtraInfo += `<br><span style="color:#fbbf24;font-weight:bold;">🏁 オーラス終了（終局または延長戦を選択できます）</span>`;
    } else if (canAgariYame) {
      modalExtraInfo += `<br><span style="color:#34d399;font-weight:bold;">👑 オーラス親トップ（アガリ止め/聴牌止めで終局可能）</span>`;
    }

    const nextLogs = [...appState.matchLogs, currentLogObj];

    setAppState((prev) => ({
      ...prev,
      currentPoints: nextPoints,
      honbaCount: nextHonba,
      kyotakuCount: nextKyotaku,
      matchLogs: nextLogs,
      roundHistory: [...prev.roundHistory, snapshot],
    }));

    setTransferModal({
      isOpen: true,
      title: `${windStr}${appState.currentKyoku}局 ${currentHonba}本場 精算`,
      subtitle: modalSubtitle,
      diffList,
      extraInfo: modalExtraInfo,
      isTobiEnd,
      isRenchan,
      isAllLastEnd,
      canAgariYame,
      isSameKyokuRetry: false,
    });
  };

  const handleConfirmPointTransferNext = (forceEndMatch = false) => {
    const { isTobiEnd, isRenchan, isSameKyokuRetry } = transferModal;
    setTransferModal((prev) => ({ ...prev, isOpen: false }));

    if (isTobiEnd || forceEndMatch) {
      finalizeEndMatch(
        appState.currentPoints,
        appState.matchLogs,
        appState.kyotakuCount
      );
      return;
    }

    if (isSameKyokuRetry) {
      setMatchCalc(INITIAL_MATCH_CALC);
      return;
    }

    setAppState((prev) => {
      let nextKyoku = prev.currentKyoku;
      let nextWind = prev.currentWind;
      const nextActive = [...prev.activePlayers];
      let nextSub = prev.subPlayer;

      if (!isRenchan) {
        if (prev.rules.gameMode === "4-3打ち" && nextSub !== null) {
          const currentOyaIndex = (prev.currentKyoku - 1) % 3;
          const oldOya = nextActive[currentOyaIndex];
          nextActive[currentOyaIndex] = nextSub;
          nextSub = oldOya;
          nextKyoku += 1;
          if (nextKyoku > 3) {
            nextKyoku = 1;
            nextWind = (nextWind + 1) % 4;
          }
        } else {
          nextKyoku += 1;
          const maxKyoku = prev.tableSize === 3 ? 3 : 4;
          if (nextKyoku > maxKyoku) {
            nextKyoku = 1;
            nextWind = (nextWind + 1) % 4;
          }
        }
      }

      return {
        ...prev,
        activePlayers: nextActive,
        subPlayer: nextSub,
        currentKyoku: nextKyoku,
        currentWind: nextWind,
        riichiPlayers: [],
      };
    });

    setMatchCalc(INITIAL_MATCH_CALC);
  };

  const handleEndMatch = () => {
    finalizeEndMatch(
      appState.currentPoints,
      appState.matchLogs,
      appState.kyotakuCount
    );
  };

  return (
    <>
      {appState.currentScreen === "screen-register" && (
        <RegisterScreen
          rooms={appState.rooms}
          currentRoomName={appState.currentRoomName}
          allPlayers={appState.allPlayers}
          onSelectRoom={handleSelectRoom}
          onCreateRoom={handleCreateRoom}
          onDeleteCurrentRoom={handleDeleteCurrentRoom}
          onSubmitRegistration={handleSubmitRegistration}
          onResetAllData={handleResetAllData}
        />
      )}

      {appState.currentScreen === "screen-rules" && (
        <RulesScreen
          allPlayers={appState.allPlayers}
          seatAssignments={appState.seatAssignments}
          rules={appState.rules}
          getPlayerName={getPlayerName}
          onUpdateRules={handleUpdateRules}
          onUpdateSeats={handleUpdateSeats}
          onStartMatch={handleStartMatch}
          onBackToRegister={() =>
            setAppState((prev) => ({
              ...prev,
              currentScreen: "screen-register",
            }))
          }
        />
      )}

      {appState.currentScreen === "screen-match" && (
        <MatchScreen
          activePlayers={appState.activePlayers}
          subPlayer={appState.subPlayer}
          currentPoints={appState.currentPoints}
          tableSize={appState.tableSize}
          currentWind={appState.currentWind}
          currentKyoku={appState.currentKyoku}
          honbaCount={appState.honbaCount}
          kyotakuCount={appState.kyotakuCount}
          riichiPlayers={appState.riichiPlayers}
          rules={appState.rules}
          dice={appState.dice}
          matchCalc={matchCalc}
          canUndo={appState.roundHistory.length > 0}
          getPlayerName={getPlayerName}
          onRollDice={handleRollDice}
          onToggleRiichi={handleToggleRiichi}
          onManualScoreChange={handleManualScoreChange}
          onUpdateMatchCalc={handleUpdateMatchCalc}
          onClearRoleSlots={handleClearRoleSlots}
          onExecutePointTransfer={handleExecutePointTransfer}
          onExecuteAbortiveDraw={handleExecuteAbortiveDraw}
          onExecuteChombo={handleExecuteChombo}
          onUndoLastRound={handleUndoLastRound}
          onOpenLogModal={() => setIsLogOpen(true)}
          onEndMatch={handleEndMatch}
        />
      )}

      {appState.currentScreen === "screen-result" && (
        <ResultScreen
          resultRows={appState.lastResultRows}
          onOpenLogModal={() => setIsLogOpen(true)}
          onOpenStatsModal={() => setIsStatsOpen(true)}
          onNextGame={() =>
            setAppState((prev) => ({
              ...prev,
              currentScreen: "screen-rules",
            }))
          }
        />
      )}

      <StatsModal
        isOpen={isStatsOpen}
        roomName={appState.currentRoomName}
        room={appState.rooms[appState.currentRoomName]}
        onUndoLastMatchStats={handleUndoLastMatchStats}
        onClose={() => setIsStatsOpen(false)}
      />

      <LogModal
        isOpen={isLogOpen}
        matchLogs={appState.matchLogs}
        canUndo={
          appState.currentScreen === "screen-match" &&
          appState.roundHistory.length > 0
        }
        onUndoLastRound={handleUndoLastRound}
        onClose={() => setIsLogOpen(false)}
      />

      <TransferResultModal
        data={transferModal}
        onConfirmNext={handleConfirmPointTransferNext}
      />
    </>
  );
};
