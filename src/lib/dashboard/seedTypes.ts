// 씨앗 모드 공용 타입 — 클라(NewRunButton)와 서버 액션(startSeedRun)이 공유.
//   ※ Server Action 파일("use server")은 비동기 함수만 export 가능 → 타입은 여기(순수 모듈)에 둔다.

export type ContentRelation = "reference" | "series_followup";

export const RELATION_LABEL: Record<ContentRelation, string> = {
  reference: "참고",
  series_followup: "이어보기(후속)",
};

export interface SeedReference {
  contentId: string;
  relation: ContentRelation;
}

export interface SeedRunInput {
  topic: string;
  references?: SeedReference[]; // 참조/이어볼 기존편(0~N)
  intent?: string; // 연결 의도(어떻게 이을지)
}
