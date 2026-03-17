/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your login link for mAI Prop</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src="https://cqxcztafhnwkhxgaylne.supabase.co/storage/v1/object/public/email-assets/logo-new.png" alt="mAI Prop" width="180" style={{ margin: '0 auto' }} />
        </Section>
        <Section style={card}>
          <Heading style={h1}>Your login link</Heading>
          <Text style={text}>Click below to log in to mAI Prop. This link expires shortly.</Text>
          <Section style={btnWrap}><Button style={button} href={confirmationUrl}>Log In</Button></Section>
        </Section>
        <Text style={footer}>If you didn't request this link, you can safely ignore this email.</Text>
        <Text style={footerBrand}>© 2025 mAI Prop · <Link href="https://investmentsmai.lovable.app" style={footerLink}>investmentsmai.lovable.app</Link></Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '0', margin: '0 auto', maxWidth: '520px' }
const header = { backgroundColor: '#000014', padding: '28px 0', textAlign: 'center' as const, borderRadius: '8px 8px 0 0' }
const card = { backgroundColor: '#0a0e2a', padding: '32px 30px', borderRadius: '0 0 8px 8px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#4ef5f1', margin: '0 0 16px', fontFamily: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif" }
const text = { fontSize: '15px', color: '#e0fafa', lineHeight: '1.6', margin: '0 0 16px' }
const btnWrap = { textAlign: 'center' as const, margin: '30px 0' }
const button = { backgroundColor: '#4ef5f1', color: '#000014', fontSize: '15px', fontWeight: '600' as const, borderRadius: '8px', padding: '14px 28px', textDecoration: 'none', display: 'inline-block' as const }
const footer = { fontSize: '12px', color: '#888', margin: '20px 0 0', textAlign: 'center' as const }
const footerBrand = { fontSize: '12px', color: '#666', textAlign: 'center' as const, margin: '8px 0 0' }
const footerLink = { color: '#8755f2', textDecoration: 'none' }
