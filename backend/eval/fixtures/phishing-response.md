---
title: Phishing Incident Response
facts: [headers, quarantine, reset, indicators, lessons learned]
---
# Phishing Incident Response

## Triage

When a user reports a suspicious email, the analyst first checks the email headers: the Return-Path, the Received chain and the SPF, DKIM and DMARC results. A failed DMARC check on a message that claims to come from the company domain is a strong sign of spoofing.

## Containment

If the message is malicious, the analyst searches all mailboxes for the same sender, subject or attachment hash and moves every copy to quarantine. Links in the email are blocked at the web proxy.

## Eradication and Recovery

Users who clicked the link or entered credentials must reset their password and have their active sessions revoked. Multi-factor authentication is checked for unknown devices. The indicators — sender address, domains, URLs and file hashes — are added to the blocklists and shared with the threat intelligence team.

## Lessons Learned

After the incident the team records the timeline, what worked, and what should change, for example a new mail-flow rule or targeted awareness training.
