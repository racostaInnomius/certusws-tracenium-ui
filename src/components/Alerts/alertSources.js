// src/components/Alerts/alertSources.js
//
// El nombre visible de cada fuente de alerta. Vivía dentro de Alerts.jsx; lo
// usan también los destinos SIEM (ADR-0028), y dos copias de esta lista son
// justo cómo una fuente nueva acaba sin nombre en una de las dos pantallas.

// Must stay in step with the backend's handler map (ALERT_SOURCES in
// modules/alerts/alerts.service.ts). This list feeds the feed's source
// filter, so a missing entry means that source cannot be filtered on —
// which is how compliance_stale, software_change and both CDP sources
// went unreachable here for a while.
export const SOURCE_LABEL = {
  security_event:     "Security event",
  compliance_finding: "Compliance finding",
  compliance_score:   "Compliance score",
  compliance_stale:   "Compliance stale",
  device_offline:     "Device offline",
  cert_expiry:        "Agent cert expiry",
  job_failure:        "Job failure",
  device_enrollment:  "Device enrolled",
  software_change:    "Software change",
  cdp_cert_expiry:    "Endpoint cert expiry",
  cdp_weak_crypto:    "Certificate hygiene",
  cdp_trust_anchor:   "Trust anchor",
  cdp_pqc_roadmap:    "Post-quantum roadmap",
  disk_capacity:      "Disk capacity",
  browser_extension:  "Browser extension",
  browser_threat:     "Browser threat",
  geofence_transition: "Geofence",
  hardware_change:    "Hardware change",
  // Un informe programado que se rindió con un periodo: ese mes de evidencia
  // no existe y no se arregla solo.
  report_schedule_abandoned: "Scheduled report missed",
  // Cobertura: un equipo que aparece en Active Directory sin agente.
  discovery_gap:      "Computer without agent",
  // ADR-0027: un fichero vigilado apareció, se borró o cambió.
  file_integrity:     "File integrity"
};
