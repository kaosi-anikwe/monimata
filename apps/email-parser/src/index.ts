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

import { withSentry } from '@sentry/cloudflare';
import PostalMime from 'postal-mime';

export interface Env {
    /** Shared secret validated by FastAPI /webhooks/bank-alerts */
    WEBHOOK_SECRET: string;
    /** Sentry DSN for error reporting */
    SENTRY_DSN: string;
    /** API base URL (default: https://api.monimata.ng) */
    API_BASE_URL?: string;
}

function arrayBufferToBase64(buffer: string | ArrayBuffer | Uint8Array): string {
    if (typeof buffer === 'string') return btoa(buffer);
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export default withSentry(
    (env: Env) => ({
        dsn: env.SENTRY_DSN,
        tracesSampleRate: 1.0,
        sendDefaultPii: true,
    }),
    {
        async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext) {
            const apiUrl = `${env.API_BASE_URL ?? 'https://api.monimata.ng'}/webhooks/bank-alerts`;
            const parser = new PostalMime();

            const rawEmail = await new Response(message.raw).arrayBuffer();
            const email = await parser.parse(rawEmail);

            const payload = {
                to: message.to,
                from: message.from,
                subject: email.subject ?? null,
                body: email.text ?? null,
                html: email.html ?? null,
                attachments: email.attachments.map(att => ({
                    filename: att.filename ?? null,
                    mimeType: att.mimeType,
                    disposition: att.disposition ?? null,
                    contentId: att.contentId ?? null,
                    content: arrayBufferToBase64(att.content),
                })),
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-MoniMata-Secret': env.WEBHOOK_SECRET,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const detail = await response.text();
                throw new Error(
                    `API responded ${response.status}: ${detail} (from=${message.from}, to=${message.to})`,
                );
            }
        },
    } satisfies ExportedHandler<Env>,
);
