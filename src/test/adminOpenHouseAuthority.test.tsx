import React, { Suspense } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const fixture = vi.hoisted(() => ({
  actor: 'admin' as 'admin' | 'owner' | 'manager' | 'viewer' | 'signedOut',
  organizationsLoading: false,
  selectedColumns: vi.fn(),
  settingsSave: vi.fn(),
  settingsRead: vi.fn(),
  registrationsRead: vi.fn(),
  offersRead: vi.fn(),
  row: { id: 'a13a0002-0000-4000-8000-000000000001', owner_id: 'a13a0001-0000-4000-8000-000000000001', organization_id: null as string | null, title: 'Synthetic admin OH boundary', listing_type: 'open_house', status: 'active', open_house_date: '2026-09-29T10:00:00.000Z', price: 200000, views_count: 0, cover_image_url: null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (name: string) => {
    if (name !== 'get_listing_management_catalogue') throw new Error(`unexpected RPC ${name}`);
    const b = { select: (columns: string) => { fixture.selectedColumns(columns); return b; }, eq: () => b, order: () => Promise.resolve({ data: [fixture.row], error: null }) };
    return b;
  } },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fixture.actor === 'signedOut' ? null : { id: fixture.actor === 'owner' ? fixture.row.owner_id : `actor-${fixture.actor}` } }) }));
vi.mock('@/hooks/useManageableOrganizations', () => ({ useManageableOrganizations: () => ({ data: fixture.actor === 'manager' && fixture.row.organization_id ? [{ id: fixture.row.organization_id, name: 'Synthetic organization', role: 'admin' }] : [], isLoading: fixture.organizationsLoading }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/Navbar', () => ({ Navbar: () => <nav /> }));
vi.mock('@/components/Footer', () => ({ Footer: () => <footer /> }));
vi.mock('@/components/POFVerificationPanel', () => ({ POFVerificationPanel: () => <div>Separate POF review</div> }));
vi.mock('@/hooks/useOpenHouseAssetControl', () => {
  const reg = { id: 'reg-1', listing_id: fixture.row.id, requester_id: 'a13a0001-0000-4000-8000-000000000004', status: 'pending', contact_name: 'Synthetic bidder', id_doc_url: 'known/id.pdf', id_verified_at: null, proof_of_funds_url: null, pof_verified_status: 'unreviewed' };
  const offer = { id: 'offer-1', listing_id: fixture.row.id, bidder_id: reg.requester_id, amount: 210000, status: 'revealed', profiles: { display_name: 'Synthetic bidder' } };
  const noMutation = { mutate: vi.fn(), isPending: false };
  return {
    useOpenHouseSettings: () => { fixture.settingsRead(); return { data: { listing_id: fixture.row.id, timeslots: [], broker_required: false, allow_sealed_bids: true, offer_deadline: '2026-09-29T11:00:00.000Z' }, isLoading: false }; },
    useOpenHouseRegistrations: () => { fixture.registrationsRead(); return { data: fixture.actor === 'owner' ? [reg] : [], isLoading: false }; },
    useOpenHouseOffers: () => { fixture.offersRead(); return { data: fixture.actor === 'owner' ? [offer] : [] }; },
    useMyOpenHouseRegistrations: () => ({ data: [], isLoading: false }),
    useMyOpenHouseOffers: () => ({ data: [], isLoading: false }),
    useUpsertOpenHouseSettings: () => ({ mutate: fixture.settingsSave, isPending: false }),
    useUpdateOpenHouseRegistration: () => noMutation,
    useUpdateOpenHouseOffer: () => noMutation,
    useAcceptOpenHouseOffer: () => noMutation,
    useReopenOpenHouseOfferSelection: () => noMutation,
    useRevealAllOffers: () => noMutation,
    getOpenHouseApprovalBlockers: () => [],
    getOpenHouseDocSignedUrl: vi.fn(),
  };
});

import AdminDashboard from '@/pages/AdminDashboard';

function renderAdmin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <MemoryRouter initialEntries={['/admin?tab=open-houses']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><QueryClientProvider client={qc}><Suspense fallback={<div>Loading tab</div>}><Routes><Route path="/admin" element={<AdminDashboard />} /></Routes></Suspense></QueryClientProvider></MemoryRouter>;
  const page = render(tree());
  return { ...page, rerenderActor: () => page.rerender(tree()) };
}

afterEach(() => { cleanup(); fixture.settingsSave.mockReset(); fixture.settingsRead.mockReset(); fixture.registrationsRead.mockReset(); fixture.offersRead.mockReset(); fixture.selectedColumns.mockReset(); fixture.actor = 'admin'; fixture.organizationsLoading = false; fixture.row.organization_id = null; });

describe('current Admin Open Houses component with explicit transport fixtures', () => {
  it('shows a non-owner admin the listing overview without owner controls or child reads', async () => {
    fixture.actor = 'admin';
    renderAdmin();
    fireEvent.click(await screen.findByText('Synthetic admin OH boundary'));
    expect(screen.getByRole('link', { name: /View/i })).toHaveAttribute('href', `/open-house/${fixture.row.id}`);
    expect(screen.queryByRole('link', { name: /Edit listing/i })).not.toBeInTheDocument();
    expect(screen.getByText(/managed by the listing owner/i)).toBeInTheDocument();
    expect(screen.queryByText('Asset Control Settings')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(fixture.settingsRead).not.toHaveBeenCalled();
    expect(fixture.registrationsRead).not.toHaveBeenCalled();
    expect(fixture.offersRead).not.toHaveBeenCalled();
    expect(fixture.settingsSave).not.toHaveBeenCalled();
    expect(fixture.selectedColumns).toHaveBeenCalledWith(expect.stringContaining('owner_id,organization_id'));
  });

  it('shows host registration and offer actions for the same owner listing', async () => {
    fixture.actor = 'owner';
    renderAdmin();
    fireEvent.click(await screen.findByText('Synthetic admin OH boundary'));
    expect(screen.getAllByText('Synthetic bidder').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Verify ID' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Edit listing/i })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Asset Control Settings'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(fixture.registrationsRead).toHaveBeenCalled();
    expect(fixture.offersRead).toHaveBeenCalled();
  });

  it('keeps listing Edit for its organization manager without owner controls', async () => {
    fixture.actor = 'manager';
    fixture.row.organization_id = 'org-1';
    renderAdmin();
    fireEvent.click(await screen.findByText('Synthetic admin OH boundary'));
    expect(screen.getByRole('link', { name: /Edit listing/i })).toHaveAttribute('href', `/listings/${fixture.row.id}/edit`);
    expect(screen.getByRole('link', { name: /View/i })).toBeInTheDocument();
    expect(screen.queryByText('Asset Control Settings')).not.toBeInTheDocument();
    expect(fixture.registrationsRead).not.toHaveBeenCalled();
  });

  it('hides Edit while memberships load and for an unrelated viewer', async () => {
    fixture.actor = 'manager';
    fixture.row.organization_id = 'org-1';
    fixture.organizationsLoading = true;
    const page = renderAdmin();
    fireEvent.click(await screen.findByText('Synthetic admin OH boundary'));
    expect(screen.queryByRole('link', { name: /Edit listing/i })).not.toBeInTheDocument();
    expect(fixture.registrationsRead).not.toHaveBeenCalled();
    fixture.organizationsLoading = false;
    page.rerenderActor();
    expect(screen.getByRole('link', { name: /Edit listing/i })).toBeInTheDocument();
    fixture.actor = 'viewer';
    page.rerenderActor();
    expect(screen.queryByRole('link', { name: /Edit listing/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Asset Control Settings')).not.toBeInTheDocument();
  });

  it('unmounts owner dialogs and expanded state across admin, owner, and signed-out transitions', async () => {
    fixture.actor = 'admin';
    const page = renderAdmin();
    fireEvent.click(await screen.findByText('Synthetic admin OH boundary'));
    expect(screen.getByText(/managed by the listing owner/i)).toBeInTheDocument();
    fixture.actor = 'owner';
    page.rerenderActor();
    fireEvent.click(await screen.findByText('Synthetic admin OH boundary'));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('dialog', { name: 'Rejection reason' })).toBeInTheDocument();
    fixture.actor = 'admin';
    page.rerenderActor();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rejection reason' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    fixture.actor = 'signedOut';
    page.rerenderActor();
    expect(screen.queryByText('Synthetic admin OH boundary')).not.toBeInTheDocument();
  });

  it('keeps the separate POF review tab available', async () => {
    renderAdmin();
    await screen.findByText('Synthetic admin OH boundary');
    fireEvent.click(screen.getByRole('button', { name: 'POF Review' }));
    expect(await screen.findByText('Separate POF review')).toBeInTheDocument();
  });
});
