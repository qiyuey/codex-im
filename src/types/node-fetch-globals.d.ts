import type { Body as NodeFetchBody } from "node-fetch";

declare global {
  interface Body extends NodeFetchBody {}

  type BodyInit = NonNullable<RequestInit["body"]>;
  type HeadersInit = NonNullable<RequestInit["headers"]>;
}
