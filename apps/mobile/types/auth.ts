// MoniMata - zero-based budgeting for Nigerians
// Copyright (C) 2026  MoniMata Contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Auth types for the console gateway (console.monimata.ng).
 *
 * Defined manually — NOT generated from any OpenAPI spec — so the private
 * gateway's API surface is never exposed in the open-source repository.
 */

// ── Request types ────────────────────────────────────────────────────────────

export interface RegisterRequest {
    email: string;
    password: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RefreshRequest {
    refresh_token: string;
}

export interface ForgotPasswordRequest {
    email: string;
}

export interface VerifyResetCodeRequest {
    email: string;
    code: string;
}

export interface ResetPasswordRequest {
    reset_token: string;
    new_password: string;
}

export interface UpdateProfileRequest {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    onboarded?: boolean;
}

// ── Response types ───────────────────────────────────────────────────────────

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
}

export interface AccessTokenResponse {
    access_token: string;
    refresh_token: string;
}

export interface ResetTokenResponse {
    reset_token: string;
}

export interface UserResponse {
    id: string;
    email: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    onboarded: boolean;
    streak: number;
    created_at: string;
}

/** Convenience alias used throughout the app. */
export type User = UserResponse;
