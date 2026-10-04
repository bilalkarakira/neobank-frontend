export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
  createdAt: string;
}

/** RFC 7807 problem details as returned by the backend. */
export interface ApiProblem {
  code?: string;
  detail?: string;
  fields?: Record<string, string>;
}
