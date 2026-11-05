export type ScreenId =
  | "screen-register"
  | "screen-rules"
  | "screen-match"
  | "screen-result";

export type GameMode = "4" | "3" | "4-3打ち";

export type AgariType = "ron" | "tsumo" | "tenpai";

export type ManganScale =
  | "mangan"
  | "hanman"
  | "baiman"
  | "sanbaiman"
  | "yakuman"
  | null;

export interface Player {
  id: number;
  name: string;
  totalGames: number;
  points: number;
}

export interface Room {
  roomName: string;
  gameCount: number;
  nextPlayerId: number;
  players: Record<number, Player>;
  playerGames?: Record<number, number>;
}

export interface CustomRules {
  gameMode: GameMode;
  length: "tonan" | "tonpu";
  points: "25000-30000" | "30000-30000" | "30000-35000";
  uma: "10-30" | "10-20" | "none";
  renchan: "tenpai" | "agari";
  tobi: "ari" | "nashi";
  kuitan: "ariari" | "ari-nashi" | "nashinashi";
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
  lastResultRows: ResultRow[];
  dice: DiceState;
}

export interface MatchCalcState {
  winners: number[];
  loser: number | null;
  type: AgariType;
  scale: ManganScale;
  fu: number;
  han: number;
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
}

export const WIND_LABELS = ["東", "南", "西", "北"] as const;

