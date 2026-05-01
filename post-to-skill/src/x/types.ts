export type XPost = {
  id: string;
  text: string;
  authorName: string;
  authorHandle: string;
  createdAt: string;
  url: string;
};

export type XParseResult =
  | { kind: 'post'; id: string }
  | { kind: 'handle'; handle: string }
  | { kind: 'invalid'; reason: string };
