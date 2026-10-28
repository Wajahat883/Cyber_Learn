---
title: SIEM Architecture
facts: [4625, 4624, normalization, correlation, analyst]
---
# SIEM Architecture

A Security Information and Event Management (SIEM) system collects security events from many log sources.

## Log Collection

Log sources such as Windows servers, firewalls and Linux hosts forward events to the SIEM. Agents or syslog forwarders send the events over the network. Normalization converts different log formats into a common schema.

## Correlation and Alerting

The SIEM correlates events using detection rules. When a rule matches, the SIEM raises an alert. For example, many failed logons (Windows event ID 4625) followed by a success (event ID 4624) may indicate a brute-force attack.

```
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625}
```

## Investigation

A SOC analyst triages the alert, reviews related events on a timeline and decides whether to escalate the incident. The analyst must gather more evidence before concluding that an attack occurred.
