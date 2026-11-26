/** A song as returned by `GET /api/songs`. */
export type Song = {
  id: string;
  title: string;
  uploadedBy: string;
  url: string;
  createdAt: number;
};

/** Error shape returned by every API route. */
export type ApiError = {
  error: string;
};

/** The signed-in user as returned by the auth routes. Never includes the password hash. */
export type SessionUser = {
  username: string;
  premium: boolean;
};
