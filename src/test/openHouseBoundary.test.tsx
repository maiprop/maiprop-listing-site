import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,renderHook} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>mocks.rpc(...args),from:(...args:unknown[])=>mocks.from(...args)}}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'actor'}})}));
vi.mock('sonner',()=>({toast:{success:mocks.success,error:mocks.error}}));
import {useMyOpenHouseRegistrations,useMyOpenHouseOffers} from '@/hooks/useOpenHouseAssetControl';
import {POFVerificationPanel} from '@/components/POFVerificationPanel';
import {getOpenHouseListingContexts,requireOpenHouseListingContext} from '@/services/openHouseContextService';
const version='2026-09-23T11:22:33.123456+00:00';
const row={id:'11111111-1111-4111-8111-111111111111',requester_id:'buyer-a',proof_of_funds_url:'proof.pdf',proof_amount:200,created_at:null,listing_id:'listing-a',pof_verified_status:'unreviewed',pof_rejection_reason:null,rejection_reason:null,status:'pending',updated_at:version};
function wrap({children}:{children:React.ReactNode}){return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{children}</QueryClientProvider>;}
beforeEach(()=>vi.clearAllMocks());
describe('Open Houses scoped boundary client',()=>{
 it.each([useMyOpenHouseRegistrations,useMyOpenHouseOffers])('hydrates own rows in one batch and preserves missing context/order',async hook=>{
  const rows=[{id:'r-b',listing_id:'b'},{id:'r-a',listing_id:'a'},{id:'r-a2',listing_id:'a'}];
  const builder={select:vi.fn(),eq:vi.fn(),order:vi.fn().mockResolvedValue({data:rows,error:null})};builder.select.mockReturnValue(builder);builder.eq.mockReturnValue(builder);mocks.from.mockReturnValue(builder);
  mocks.rpc.mockResolvedValue({data:[{id:'a',title:'Actual title',city:'Athens',address:'Address',cover_image_url:null,open_house_date:null}],error:null});
  const {result}=renderHook(hook,{wrapper:wrap});await waitFor(()=>expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.map(r=>r.id)).toEqual(['r-b','r-a','r-a2']);
  expect(result.current.data?.[0].listings).toBeNull();expect(result.current.data?.[1].listings?.title).toBe('Actual title');
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_open_house_listing_context',{p_listing_ids:['b','a']});
  expect(builder.select.mock.calls[0][0]).not.toContain('listings');
 });
 it.each([version,null])('passes exact backend version %s through real panel review',async updated_at=>{
  mocks.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>Promise.resolve({data:[name==='get_admin_open_house_pof_reviews'?{...row,updated_at}:{...row,pof_verified_status:args.p_decision,updated_at:'2026-09-24T11:22:33.987654Z'}],error:null}));
  render(<POFVerificationPanel/>);await screen.findByRole('button',{name:'Verify'});fireEvent.click(screen.getByRole('button',{name:'Verify'}));
  await waitFor(()=>expect(mocks.success).toHaveBeenCalled());
  expect(mocks.rpc).toHaveBeenCalledWith('review_admin_open_house_pof',{p_registration_id:row.id,p_decision:'verified',p_reason:null,p_expected_updated_at:updated_at});expect(mocks.from).not.toHaveBeenCalled();
 });
 it('clears prior scope dialog and rows while new scope fails',async()=>{
  let finish:(v:unknown)=>void=()=>{};
  mocks.rpc.mockResolvedValueOnce({data:[row],error:null}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const view=render(<POFVerificationPanel dealId='a'/>);await screen.findByRole('button',{name:'Reject'});fireEvent.click(screen.getByRole('button',{name:'Reject'}));expect(screen.getByRole('dialog')).toBeInTheDocument();
  view.rerender(<POFVerificationPanel dealId='b'/>);await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  finish({data:null,error:new Error('failed B')});await screen.findByRole('alert');expect(screen.queryByText('Investor buyer-')).toBeNull();expect(screen.queryByRole('button',{name:'Verify'})).toBeNull();
 });
 it('treats whitespace-only document paths as unavailable',async()=>{
  mocks.rpc.mockResolvedValue({data:[{...row,proof_of_funds_url:'   '}],error:null});render(<POFVerificationPanel/>);await screen.findByText('Document unavailable');expect(screen.queryByRole('button',{name:'View Doc'})).toBeNull();
 });
 it('batches more than 100 unique listing ids and propagates context errors',async()=>{
  mocks.rpc.mockResolvedValue({data:[],error:null});
  await getOpenHouseListingContexts(Array.from({length:201},(_,i)=>String(i)));
  expect(mocks.rpc.mock.calls.map(call=>call[1].p_listing_ids.length)).toEqual([100,100,1]);
  mocks.rpc.mockResolvedValue({data:null,error:new Error('strict failure')});
  await expect(requireOpenHouseListingContext('a')).rejects.toThrow('strict failure');
  mocks.rpc.mockResolvedValue({data:[],error:null});
  await expect(requireOpenHouseListingContext('a')).rejects.toThrow('unavailable');
 });
 it('ignores review completion after changing listing scope',async()=>{
  let finish:(v:unknown)=>void=()=>{};
  mocks.rpc.mockResolvedValueOnce({data:[row],error:null}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({data:[{...row,id:'b-row',requester_id:'buyer-b'}],error:null});
  const view=render(<POFVerificationPanel dealId='a'/>);fireEvent.click(await screen.findByRole('button',{name:'Verify'}));
  view.rerender(<POFVerificationPanel dealId='b'/>);await screen.findByText('Investor buyer-');
  finish({data:[{...row,pof_verified_status:'verified'}],error:null});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Verify'})).toBeInTheDocument());
  expect(mocks.success).not.toHaveBeenCalled();
 });
 it('loads once in StrictMode and retains zero proof amount',async()=>{
  mocks.rpc.mockResolvedValue({data:[{...row,proof_amount:0}],error:null});
  render(<React.StrictMode><POFVerificationPanel/></React.StrictMode>);await screen.findByRole('button',{name:'Verify'});
  expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(screen.queryByText('Amount unavailable')).toBeNull();
 });
 it('keeps rejection pending when no updated row is returned',async()=>{
  mocks.rpc.mockResolvedValueOnce({data:[row],error:null}).mockResolvedValueOnce({data:[],error:null});
  render(<POFVerificationPanel/>);fireEvent.click(await screen.findByRole('button',{name:'Reject'}));
  fireEvent.change(screen.getByPlaceholderText(/Document expired/),{target:{value:'Expired'}});fireEvent.click(screen.getByRole('button',{name:'Confirm Rejection'}));
  await waitFor(()=>expect(mocks.error).toHaveBeenCalled());expect(mocks.success).not.toHaveBeenCalled();expect(screen.getByRole('dialog')).toBeInTheDocument();
 });
});
