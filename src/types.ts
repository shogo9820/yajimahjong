export type ScreenId =
  | "screen-register"
  | "screen-rules"
  | "screen-match"
  | "screen-result";

export type GameMode = "4" | "3" | "4-3打ち";

export type AgariType = "ron" | "tsumo" | "tenpai" | "special";

export type ManganScale =
  | "mangan"
  | "hanman"
  | "baiman"
  | "sanbaiman"
  | "yakuman"
  | "double_yakuman"
  | null;

export interface Player {
  id: number;
  name: string;
  totalGames: number;
  points: number;
  rankCounts?: [number, number, number, number];
}

export interface MatchHistoryPlayerResult {
  playerId: number;
  name: string;
  rank: number;
  score: number;
  pt: number;
}

export interface MatchHistoryEntry {
  id: string;
  timestamp: string;
  results: MatchHistoryPlayerResult[];
}

export interface Room {
  roomName: string;
  gameCount: number;
  nextPlayerId: number;
  players: Record<number, Player>;
  playerGames?: Record<number, number>;
  matchHistory?: MatchHistoryEntry[];
}

export interface CustomRules {
  gameMode: GameMode;
  length: "tonan" | "tonpu";
  points: "25000-30000" | "30000-30000" | "30000-35000";
  uma: "10-30" | "10-20" | "none";
  renchan: "tenpai" | "agari";
  tobi: "ari" | "nashi";
  kuitan: "ariari" | "ari-nashi" | "nashinashi";
  tieBreaker: "kamicha" | "split";
  sanmaTsumo: "tsumozon" | "marutori";
  sanmaNoten: "3000" | "2000";
}

export interface MatchLogRow {
  type: string;
  name: string;
  pt: number;
}

export interface MatchLog {
  title: string;
  rows: MatchLogRow[];
  isTobiEnd: boolean;
  tobiPlayer: string;
}

export interface ResultRow {
  rank: number;
  name: string;
  score: number;
  pt: number;
}

export interface DiceState {
  resultText: string;
  naviText: string;
}

export interface RoundSnapshot {
  activePlayers: number[];
  subPlayer: number | null;
  currentPoints: Record<number, number>;
  currentWind: number;
  currentKyoku: number;
  honbaCount: number;
  kyotakuCount: number;
  riichiPlayers: number[];
  matchLogs: MatchLog[];
}

export interface AppState {
  rooms: Record<string, Room>;
  currentRoomName: string;
  allPlayers: number[];
  activePlayers: number[];
  subPlayer: number | null;
  seatAssignments: (number | null)[];
  currentPoints: Record<number, number>;
  tableSize: number;
  currentWind: number;
  currentKyoku: number;
  honbaCount: number;
  kyotakuCount: number;
  riichiPlayers: number[];
  currentScreen: ScreenId;
  rules: CustomRules;
  matchLogs: MatchLog[];
  roundHistory: RoundSnapshot[];
  lastResultRows: ResultRow[];
  dice: DiceState;
}

export interface WinnerHandConfig {
  fu: number;
  han: number;
  scale: ManganScale;
}

export interface MatchCalcState {
  winners: number[];
  loser: number | null;
  type: AgariType;
  scale: ManganScale;
  fu: number;
  han: number;
  secondWinnerConfig?: WinnerHandConfig;
}

export interface TransferDiffItem {
  name: string;
  diff: number;
}

export interface TransferModalData {
  isOpen: boolean;
  title: string;
  subtitle: string;
  diffList: TransferDiffItem[];
  extraInfo: string;
  isTobiEnd: boolean;
  isRenchan: boolean;
  isAllLastEnd: boolean;
  canAgariYame: boolean;
  isSameKyokuRetry?: boolean;
}

export const WIND_LABELS = ["東", "南", "西", "北"] as const;
