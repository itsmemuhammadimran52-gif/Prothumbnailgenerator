/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import type { Timestamp } from 'firebase/firestore';

// Vite environment variable declarations
declare const __VITE_GEMINI_API_KEY__: string;

export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  fullName: string;
  photoURL: string;
  createdAt: Timestamp;
  thumbnailCount: number;
  plan: 'Starter' | 'Pro' | 'Business' | 'Agency';
  remainingGenerations: number;
  limitResetDate: Timestamp;
  hasPaid: boolean; // Payment status - user can only generate after payment
  paymentDate?: Timestamp; // When payment was made
}
