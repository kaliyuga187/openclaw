export type VerdictLabel = 'true' | 'false' | 'uncertain';

export type Claim = {
  text: string;
};

export type Verdict = {
  claim: string;
  label: VerdictLabel;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
};

export type FactCheckResult = {
  claims: Claim[];
  verdicts: Verdict[];
};
