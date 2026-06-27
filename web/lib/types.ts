export type Channel = 'sms' | 'whatsapp';

export type Category =
  | 'RENTAL_INQUIRY' | 'GENERAL_CONVERSATION' | 'SPAM' | 'WORK' | 'PERSONAL' | 'OTHER';

export interface Applicant {
  name?: string;
  moveInDate?: string;
  occupants?: number;
  hasPets?: boolean;
  petDetails?: string;
  smoker?: boolean;
  employmentStatus?: string;
  incomeVerificationOk?: boolean;
  creditCheckOk?: boolean;
  viewingRequestedTime?: string;
  qualificationScore?: number;
}

export interface ConversationRow {
  id: string;
  channel: Channel;
  contact_identifier: string;
  contact_name: string | null;
  trusted: boolean;
  opener_asked: boolean;
  decision_pending: boolean;
  decision_made: string | null;
  viewing_slots_offered: boolean;
  viewing_confirmed: boolean;
  summary: string | null;
  last_summarized_at: number;
}

export interface ClassificationResult {
  category: Category;
  intent: string | null;
  extracted_info: Record<string, any>;
}
