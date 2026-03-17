/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
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

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code for mAI Prop</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src="https://cqxcztafhnwkhxgaylne.supabase.co/storage/v1/object/public/email-assets/logo-new.png" alt="mAI Prop" width="180" style={{ margin: '0 auto' }} />
        </Section>
        <Section style={card}>
          <Heading style={h1}>Verification code</Heading>
          <Text style={text}>Use the code below to confirm your identity:</Text>
          <Text style={codeStyle}>{token}</Text>
        </Section>
        <Text style={footer}>This code expires shortly. If you didn't request this, ignore this email.</Text>
        <Text style={footerBrand}>© 2025 mAI Prop · <Link href="https://investmentsmai.lovable.app" style={footerLink}>investmentsmai.lovable.app</Link></Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '0', margin: '0 auto', maxWidth: '520px' }
const header = { backgroundColor: '#000014', padding: '28px 0', textAlign: 'center' as const, borderRadius: '8px 8px 0 0' }
const card = { backgroundColor: '#0a0e2a', padding: '32px 30px', borderRadius: '0 0 8px 8px' }
const h1 = { fontSize: '24px', fontWeight: 'bold' as const, color: '#4ef5f1', margin: '0 0 16px', fontFamily: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif" }
const text = { fontSize: '15px', color: '#e0fafa', lineHeight: '1.6', margin: '0 0 16px' }
const codeStyle = { fontFamily: "'Space Grotesk', Courier, monospace", fontSize: '28px', fontWeight: 'bold' as const, color: '#4ef5f1', margin: '0 0 30px', textAlign: 'center' as const, letterSpacing: '6px' }
const footer = { fontSize: '12px', color: '#888', margin: '20px 0 0', textAlign: 'center' as const }
const footerBrand = { fontSize: '12px', color: '#666', textAlign: 'center' as const, margin: '8px 0 0' }
const footerLink = { color: '#8755f2', textDecoration: 'none' }
