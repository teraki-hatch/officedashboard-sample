export type Client = {
  id: string;
  name: string;
  short_name: string | null;
  industry: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientInput = {
  name: string;
  short_name?: string | null;
  industry?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

export const EMPTY_CLIENT_INPUT: ClientInput = {
  name: '',
  short_name: null,
  industry: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  contact_person: null,
  contact_phone: null,
  contact_email: null,
  notes: null,
  is_active: true,
};
