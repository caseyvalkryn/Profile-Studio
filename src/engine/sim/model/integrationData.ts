import type { IntegrationProfile } from './integration';

/**
 * Integration profiles for the seed spec library, translated from open-source
 * research (manufacturer releases, DoD statements, defense trade press).
 * Only researched pairings appear: 'documented'/'probable' research entries
 * became pairs, 'unlikely'/'no' entries became denials. Protocol slugs keep
 * open standards only ('faad-c2', 'lattice', 'sapient', 'cot-tak', 'link-16');
 * closed vendor interfaces carry no slug because they do not interoperate
 * across vendors. Media and notes follow each system's published interfaces.
 */

export const INTEGRATION_PROFILES: IntegrationProfile[] = [
  // USMC LMADIS / MADIS Mk2. GlobalSecurity; Armada International 2024; army.mil Jun 2020.
  {
    specId: 'lib-rps42',
    program: 'USMC LMADIS / MADIS Mk2 (RADA MHR family)',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-modi',
        role: 'cue',
        confidence: 'documented',
        note: 'LMADIS pairs the RPS-42 radar with the Modi EW jammer as its defeat effector.',
        source: 'GlobalSecurity LMADIS; Armada International 2024',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'cue',
        confidence: 'documented',
        note: 'MADIS Mk2 RPS-42-family radar cues the Mk1 XM914E1 30mm gun.',
        source: 'Army Recognition 2025; MDAA MADIS page',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'JCO interim C-sUAS selections including L-MADIS were required to integrate with FAAD C2.',
        source: 'army.mil, June 2020',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Lattice as enterprise C-UAS C2 is contracted to integrate legacy fielded sensors over Ethernet track APIs.',
        source: 'DefenseScoop, Mar 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'Coyote Block 2 fire control requires a Ku-band uplink radar, which the S-band MHR does not provide.',
      },
    ],
  },
  // RADA MHR/eCHR family, no named US program of record. DefenseScoop Mar 2026.
  {
    specId: 'lib-rps62',
    program: 'RADA MHR/eCHR radar family',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'Northrop names MHR/RPS-42/62/82 in the FAAD C2 supported-sensor list.',
        source: 'Northrop Grumman FAAD C2 infographic NG23-0503-0384, 2023',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Lattice enterprise C2 mandate covers legacy fielded C-UAS radars integrating over standard Ethernet.',
        source: 'DefenseScoop, Mar 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'Cannot serve as Coyote Block 2 fire control; that requires the Ku-band KuRFS uplink.',
      },
    ],
  },
  // Army LIDS / FS-LIDS; Howler. RTX pages; Breaking Defense Aug 2023.
  {
    specId: 'lib-kurfs',
    program: 'Army LIDS / FS-LIDS program of record; Howler',
    protocols: ['faad-c2'],
    media: ['cable', 'proprietary-rf'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-coyote',
        role: 'fc-uplink',
        confidence: 'documented',
        medium: 'proprietary-rf',
        note: 'KuRFS is the designed fire-control source for Coyote Block 2 and provides the Ku-band guidance uplink.',
        source: 'RTX Coyote/KuRFS pages; Howler IOC release 2019',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'In FS-LIDS all KuRFS sensor data is consolidated through FAAD C2, which issues engagement options.',
        source: 'Breaking Defense, Aug 2023',
      },
      {
        withSpecId: 'lib-lpws',
        role: 'cue',
        confidence: 'documented',
        note: 'RTX states KuRFS works with the Land-based Phalanx Weapon System.',
        source: 'rtx.com KuRFS page',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'cue',
        confidence: 'documented',
        note: 'RTX states KuRFS works with 30mm cannons; the M-LIDS mast-mounted Ku-band radar cues the turret.',
        source: 'rtx.com KuRFS page; TWZ M-LIDS',
      },
      {
        withSpecId: 'lib-demshorad',
        role: 'track-data',
        confidence: 'documented',
        note: 'DE M-SHORAD onboard Ku720 360-degree radar is a scaled mobile KuRFS derivative.',
        source: 'optics.org, 2022',
      },
      {
        withSpecId: 'lib-lstar',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'KuRFS (fire control) and AN/TPQ-50 (surveillance) are complementary co-deployed FS-LIDS sensors.',
        source: 'Defense Update FS-LIDS 2025; SRC LIDS brochure',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Lattice replacing FAAD C2 as Army C-UAS fire control will need to ingest LIDS sensors including KuRFS.',
        source: 'Breaking Defense Oct 2025; DefenseScoop Mar 2026',
      },
    ],
  },
  // Army LIDS interceptor; Howler; CENTCOM combat use. RTX; Breaking Defense Aug 2023.
  {
    specId: 'lib-coyote',
    program: 'Army LIDS (FS-LIDS / M-LIDS); Howler',
    protocols: ['faad-c2'],
    media: ['proprietary-rf', 'cable'],
    standalone: false,
    guidance: 'fc-uplink',
    fcSources: ['lib-kurfs', 'lib-tpq53'],
    // Lattice qualifies because it is replacing FAAD C2 as Army C-UAS fire
    // control (Breaking Defense, Oct 2025) — matches the pair offered below.
    requiredC2: ['lib-faadc2', 'lib-lattice'],
    pairs: [
      {
        withSpecId: 'lib-kurfs',
        role: 'fc-uplink',
        confidence: 'documented',
        medium: 'proprietary-rf',
        note: 'KuRFS provides the fire-control track and in-flight guidance uplink (Howler / LIDS).',
        source: 'RTX Coyote page; Howler release 2019',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        note: 'FAAD C2 is the C2 layer that authorizes and cues Coyote engagements in LIDS.',
        source: 'Breaking Defense LIDS, Aug 2023',
      },
      {
        withSpecId: 'lib-tpq53',
        role: 'cue',
        confidence: 'documented',
        note: 'AN/TPQ-53 served as primary fire-control source for a Coyote Block 2 engagement via FAAD C2 at Yuma, Oct 2022.',
        source: 'Lockheed Martin release, Oct 27 2022',
      },
      {
        withSpecId: 'lib-lstar',
        role: 'cue',
        confidence: 'documented',
        note: 'AN/TPQ-50 provides surveillance cueing in FS-LIDS before KuRFS takes the fire-control track.',
        source: 'SRC LIDS brochure; Defense Update 2025',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Co-mounted on the same M-LIDS turret with the XM914 30mm for layered defeat under one C2.',
        source: 'TWZ M-LIDS; army-technology',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'engage-order',
        confidence: 'probable',
        note: 'Lattice, replacing FAAD C2 as Army C-UAS fire control, is expected to command legacy LIDS effectors.',
        source: 'Breaking Defense, Oct 2025',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-rps42',
        reason: 'S-band MHR cannot provide the Ku-band fire-control uplink Coyote needs.',
      },
    ],
  },
  // Army SHORAD/C-RAM C2 of record; JCO interim C2 standard. NG data sheet; Breaking Defense.
  {
    specId: 'lib-faadc2',
    program: 'Army SHORAD/C-RAM C2 program of record; JCO interim C-sUAS C2 standard',
    protocols: ['faad-c2', 'link-16'],
    media: ['cable', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-kurfs',
        role: 'track-data',
        confidence: 'documented',
        note: 'KuRFS feeds FAAD C2 in FS-LIDS.',
        source: 'Breaking Defense LIDS, Aug 2023',
      },
      {
        withSpecId: 'lib-lstar',
        role: 'track-data',
        confidence: 'documented',
        note: 'AN/TPQ-50 is digitally interoperable with FAAD C2 and provides C-RAM sense-and-warn data.',
        source: 'GlobalSecurity AN/TPQ-50; FAS LCMR handbook',
      },
      {
        withSpecId: 'lib-tpq53',
        role: 'track-data',
        confidence: 'documented',
        note: 'Q-53 integrated with FAAD C2 and served as fire-control source for C-UAS defeat at Yuma 2022.',
        source: 'Lockheed Martin, Oct 2022',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'engage-order',
        confidence: 'documented',
        note: 'FAAD C2 cues and authorizes Coyote engagements in LIDS.',
        source: 'Breaking Defense LIDS, Aug 2023',
      },
      {
        withSpecId: 'lib-lpws',
        role: 'engage-order',
        confidence: 'documented',
        note: 'LPWS is a C-RAM system-of-systems component commanded through FAAD C2.',
        source: 'C-RAM component list; NG FAAD/C-RAM C2 data sheet',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'engage-order',
        confidence: 'documented',
        note: 'NG documents the FAAD/C-RAM C2 kill chain including Bushmaster chain guns; M-LIDS operates under FAAD C2.',
        source: 'NG FAAD/C-RAM C2 data sheet; army-technology M-LIDS',
      },
      {
        withSpecId: 'lib-demshorad',
        role: 'engage-order',
        confidence: 'documented',
        medium: 'mesh-radio',
        note: 'DE M-SHORAD is interoperable with the FAAD C2 air-defense network; NG lists directed energy in the kill chain.',
        source: 'Army Recognition DE M-SHORAD; NG FAAD/C-RAM C2 data sheet',
      },
      {
        withSpecId: 'lib-phel',
        role: 'cue',
        confidence: 'documented',
        note: 'BlueHalo states LOCUST (P-HEL) supports FAAD C2 and other systems through cueing.',
        source: 'bluehalo.com C2 Tracking and Sensing',
      },
      {
        withSpecId: 'lib-leonidas',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'IFPC-HPM (Leonidas) government acceptance testing included FAAD C2 interoperability evaluation.',
        source: 'Epirus press release, Nov 2023',
      },
      {
        withSpecId: 'lib-rps42',
        role: 'track-data',
        confidence: 'documented',
        note: 'JCO interim C-sUAS selections including L-MADIS (RPS-42) were required to integrate with FAAD C2.',
        source: 'army.mil, June 2020',
      },
      {
        withSpecId: 'lib-medusa',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'USAF MEDUSA C2 is interoperable with FAAD C2 under the DoD joint C-sUAS C2 approach.',
        source: 'Air & Space Forces Magazine; DTIC AD1200505',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Lattice was selected as enterprise C-UAS C2 to replace FAAD C2, integrating legacy FAAD-connected systems during transition.',
        source: 'Breaking Defense Oct 2025; DefenseScoop Mar 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-modi',
        reason:
          'Modi II is carried as a dismounted effector; no networked FAAD C2 data interface is documented.',
      },
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'Handheld point-and-shoot jammer with no C2 data interface; operator-employed only.',
      },
      {
        withSpecId: 'lib-smash',
        reason:
          'SMASH 2000L is a self-contained optical rifle fire-control sight; no documented FAAD C2 interface.',
      },
    ],
  },
  // M-LIDS gun vehicle; MADIS Mk1; M-SHORAD Inc 1. NG data sheet; Army Recognition 2025.
  {
    specId: 'lib-xm914',
    program: 'M-LIDS gun vehicle; USMC MADIS Mk1; M-SHORAD Inc 1',
    protocols: ['faad-c2'],
    media: ['cable', 'operator-manual'],
    standalone: true,
    guidance: 'c2-cue',
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        note: 'The FAAD/C-RAM C2 kill chain explicitly includes Bushmaster chain guns with proximity ammunition.',
        source: 'NG FAAD/C-RAM C2 data sheet; army-technology M-LIDS',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'cue',
        confidence: 'documented',
        note: 'RTX states KuRFS works with 30mm cannons; the M-LIDS mast-mounted radar cues the turret.',
        source: 'rtx.com KuRFS page; TWZ M-LIDS',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Shares the M-LIDS RIwP turret with the 2-round Coyote launcher for layered defeat.',
        source: 'TWZ; army-technology M-LIDS',
      },
      {
        withSpecId: 'lib-rps42',
        role: 'cue',
        confidence: 'documented',
        note: 'MADIS Mk2 RPS-42-family radar cues the Mk1 XM914E1; M-SHORAD uses the same RADA family.',
        source: 'Army Recognition MADIS 2025; Leonardo DRS M-SHORAD',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'engage-order',
        confidence: 'probable',
        note: 'Lattice as replacement Army C-UAS fire control is expected to cue legacy gun effectors now under FAAD C2.',
        source: 'Breaking Defense, Oct 2025',
      },
    ],
  },
  // C-RAM program of record; land-based Phalanx. C-RAM component list; rtx.com.
  {
    specId: 'lib-lpws',
    program: 'C-RAM program of record (land-based Phalanx Block 1B)',
    protocols: ['faad-c2'],
    media: ['cable', 'operator-manual'],
    standalone: true,
    guidance: 'self',
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        note: 'LPWS is a listed C-RAM system-of-systems component integrated by FAAD C2 with sense-and-warn sensor data.',
        source: 'C-RAM component list; US Army C-RAM LOR checklist',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'cue',
        confidence: 'documented',
        note: 'RTX states KuRFS works with the Land-based Phalanx Weapon System.',
        source: 'rtx.com KuRFS page',
      },
      {
        withSpecId: 'lib-lstar',
        role: 'cue',
        confidence: 'documented',
        note: 'AN/TPQ-50 LCMR sense-and-warn data flows through FAAD C2 to cue LPWS engagements in the C-RAM construct.',
        source: 'GlobalSecurity AN/TPQ-50; C-RAM component list',
      },
      {
        withSpecId: 'lib-tpq53',
        role: 'cue',
        confidence: 'probable',
        note: 'Q-53 is the Firefinder successor and a FAAD C2 sensor, so a Q-53-to-LPWS cue via FAAD C2 is near-certain.',
        source: 'C-RAM component list; Lockheed Martin Oct 2022',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'engage-order',
        confidence: 'probable',
        note: 'Enterprise Lattice C2 replacing FAAD C2 would need to coordinate legacy C-RAM effectors.',
        source: 'DefenseScoop, Mar 2026',
      },
    ],
  },
  // Army RCCTO DE M-SHORAD prototype. Army Recognition fact sheet; optics.org 2022.
  {
    specId: 'lib-demshorad',
    program: 'Army RCCTO DE M-SHORAD prototype (50 kW HEL Stryker)',
    protocols: ['faad-c2'],
    media: ['mesh-radio', 'cable'],
    standalone: true,
    guidance: 'self',
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        medium: 'mesh-radio',
        note: 'Integrated and interoperable with FAAD C2, enabling external cueing while maneuvering.',
        source: 'Army Recognition DE M-SHORAD; NG FAAD/C-RAM C2 data sheet',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'track-data',
        confidence: 'documented',
        note: 'The onboard Ku720 multi-mission radar is a scaled mobile KuRFS derivative and the organic acquisition radar.',
        source: 'optics.org, 2022',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Falls under the Army enterprise C-UAS C2 transition from FAAD C2 to Lattice.',
        source: 'DefenseScoop, Mar 2026',
      },
    ],
  },
  // Army counterfire radar of record with C-UAS mode. Lockheed Martin Oct 2022.
  {
    specId: 'lib-tpq53',
    program: 'Army counterfire radar program of record (multi-mission C-UAS mode)',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'Q-53 integrated with FAAD C2 at Yuma Proving Ground, Oct 2022, feeding the C-UAS kill chain.',
        source: 'Lockheed Martin release, Oct 27 2022',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'cue',
        confidence: 'documented',
        note: 'Served as the primary fire-control source for a Coyote Block 2 launch via FAAD C2 in the 2022 demonstration.',
        source: 'Lockheed Martin release, Oct 27 2022',
      },
      {
        withSpecId: 'lib-lpws',
        role: 'cue',
        confidence: 'probable',
        note: 'As Firefinder successor and FAAD C2 sensor, Q-53 sense-and-warn data can cue C-RAM LPWS batteries.',
        source: 'C-RAM component list; Lockheed Oct 2022',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Legacy program-of-record radar within scope of the Lattice enterprise C2 integration mandate.',
        source: 'DefenseScoop, Mar 2026',
      },
    ],
  },
  // SRC AN/TPQ-50 with LSTAR software; FS-LIDS sensor. GlobalSecurity; SRC brochure.
  {
    specId: 'lib-lstar',
    program: 'AN/TPQ-50 (LCMR program of record) running LSTAR; FS-LIDS sensor',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'Provides air surveillance and RAM sense-and-warn data to FAAD C2; digitally interoperable with AFATDS too.',
        source: 'GlobalSecurity AN/TPQ-50; FAS LCMR handbook',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'cue',
        confidence: 'documented',
        note: 'In FS-LIDS the TPQ-50 provides 360-degree surveillance cueing ahead of the KuRFS fire-control track.',
        source: 'SRC LIDS brochure; Defense Update 2025',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Complementary co-deployed FS-LIDS sensors fused in FAAD C2.',
        source: 'Defense Update 2025; Breaking Defense LIDS 2023',
      },
      {
        withSpecId: 'lib-lpws',
        role: 'cue',
        confidence: 'documented',
        note: 'LCMR sense-and-warn is a listed C-RAM component; its warnings cue LPWS engagements through FAAD C2.',
        source: 'C-RAM component list; GlobalSecurity AN/TPQ-50',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Legacy LIDS sensor within scope of the Lattice enterprise C-UAS C2 transition.',
        source: 'Breaking Defense, Oct 2025',
      },
    ],
  },
  // Anduril CUxS hub; JIATF-401 enterprise C2. Anduril/Epirus 2023; DefenseScoop 2026.
  {
    specId: 'lib-lattice',
    program: 'Anduril CUxS; JIATF-401 enterprise C-UAS C2; Army IBCS-M',
    protocols: ['lattice', 'cot-tak'],
    media: ['cable', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-leonidas',
        role: 'cue',
        confidence: 'documented',
        note: 'Lattice ingests radar track data and cues Leonidas HPM to lock, track, and defeat targets.',
        source: 'Anduril/Epirus press release, Aug 2023',
      },
      {
        withSpecId: 'lib-anvil',
        role: 'engage-order',
        confidence: 'documented',
        note: 'Anvil is cued and tasked through Lattice; demonstrated end-to-end at Falcon Peak 25.2.',
        source: 'The Defense Post, Oct 2025; Anduril Falcon Peak 25.2',
      },
      {
        withSpecId: 'lib-roadrunner',
        role: 'engage-order',
        confidence: 'documented',
        note: 'Roadrunner-M is managed through Lattice C2, one operator handling multiple interceptors.',
        source: 'TWZ Dec 2023; Breaking Defense Jun 2026',
      },
      {
        withSpecId: 'lib-picogrid',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Picogrid LAPIS/Legion names Lattice among the C2 networks it feeds.',
        source: 'Picogrid press via sUAS News, Jun 2026',
      },
      {
        withSpecId: 'lib-echoshield',
        role: 'track-data',
        confidence: 'probable',
        note: 'Anduril adopted Echodyne radars for Sentry towers; same-vendor radar ingestion into Lattice is established.',
        source: 'Defense News, Jul 2026',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'engage-order',
        confidence: 'probable',
        note: 'Lattice-Coyote fire control is the planned IBCS-M architecture, not yet publicly demonstrated.',
        source: 'DefenseScoop, Nov 2025',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Lattice is fielded as the FAAD C2 successor, but a direct bidirectional link is not explicitly documented.',
        source: 'DefenseScoop Mar 2026; Breaking Defense Jun 2020',
      },
      {
        withSpecId: 'lib-merops',
        role: 'cue',
        confidence: 'probable',
        note: 'CENTCOM reporting describes Merops integrated through FAAD C2 and increasingly Anduril Lattice.',
        source: 'flightbrief.news 2026; Picogrid/sUAS News Jun 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-medusa',
        reason:
          'Competing enterprise C-UAS C2 platforms; each interoperates with FAAD C2 instead of each other.',
      },
    ],
  },
  // Anduril CUxS interceptor; Falcon Peak 25.2. Anduril; The Defense Post Oct 2025.
  {
    specId: 'lib-anvil',
    program: 'Anduril CUxS; USMC I-CsUAS; Falcon Peak 25.2',
    protocols: ['lattice'],
    media: ['proprietary-rf', 'cable'],
    standalone: false,
    guidance: 'c2-cue',
    requiredC2: ['lib-lattice'],
    pairs: [
      {
        withSpecId: 'lib-lattice',
        role: 'fc-uplink',
        confidence: 'documented',
        note: 'Anvil is cued by Lattice from tower and radar tracks, then uses onboard computer-vision terminal guidance.',
        source: 'Anduril Anvil page; The Defense Post Oct 2025',
      },
      {
        withSpecId: 'lib-roadrunner',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Co-deployed layered kinetic pair under one Lattice network in USMC and Kuwait FMS configurations.',
        source: 'Breaking Defense Jun 2026; The Defense Post Mar 2025',
      },
      {
        withSpecId: 'lib-leonidas',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Both are documented Lattice-integrated effectors, so coexistence in one Lattice network is near-certain.',
        source: 'Anduril/Epirus press Aug 2023',
      },
      {
        withSpecId: 'lib-echoshield',
        role: 'cue',
        confidence: 'probable',
        note: 'Echodyne radars anchor Anduril sentry towers whose tracks cue Anvil via Lattice, never radar-direct.',
        source: 'Defense News Jul 2026; Anduril Anvil page',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No published FAAD C2 integration kit for Anvil; all documented employments task it through Lattice.',
      },
    ],
  },
  // Anduril CUxS reusable interceptor; CENTCOM. TWZ Dec 2023; Breaking Defense Jun 2026.
  {
    specId: 'lib-roadrunner',
    program: 'Anduril CUxS; CENTCOM combat evaluation; Kuwait FMS 2026',
    protocols: ['lattice'],
    media: ['proprietary-rf', 'cable'],
    standalone: false,
    guidance: 'c2-cue',
    requiredC2: ['lib-lattice'],
    pairs: [
      {
        withSpecId: 'lib-lattice',
        role: 'fc-uplink',
        confidence: 'documented',
        note: 'Integrated with Lattice C2; a single operator manages multiple Roadrunner-M rounds.',
        source: 'TWZ Dec 2023; Anduril product material',
      },
      {
        withSpecId: 'lib-anvil',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Layered with Anvil-Kinetic under one Lattice counter-UAS network.',
        source: 'Breaking Defense Jun 2026',
      },
      {
        withSpecId: 'lib-echoshield',
        role: 'cue',
        confidence: 'probable',
        note: 'Sentry-tower radar tracks cue Roadrunner-M via Lattice in the standard Anduril configuration.',
        source: 'Defense News Jul 2026; Anduril CUxS material',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No public FAAD C2 integration of Roadrunner-M is documented; CENTCOM employment ran under Lattice.',
      },
      {
        withSpecId: 'lib-coyote',
        reason:
          'Direct competitor to Coyote Block 2 in the same threat class; no cross-integration exists.',
      },
    ],
  },
  // Picogrid Legion edge C2; LAPIS. Picogrid newsroom / sUAS News Jun 2026.
  {
    specId: 'lib-picogrid',
    program: 'Picogrid Legion expeditionary edge C2; LAPIS',
    protocols: ['cot-tak', 'faad-c2', 'lattice'],
    media: ['mesh-radio', 'cable'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-merops',
        role: 'cue',
        confidence: 'documented',
        note: 'Picogrid is the documented integration layer bridging Merops interceptors into the US expeditionary air-defense network.',
        source: 'Picogrid newsroom, Jun 2026; Tectonic Defense',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Edge sensor data is pushed into FAAD C2 classified networks through Picogrid cross-domain solution.',
        source: 'Picogrid newsroom Jun 2026; sUAS News Jun 2026',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'LAPIS supports direct integration with Lattice alongside TAK, NGC2, and Maven.',
        source: 'Picogrid/sUAS News, Jun 2026',
      },
      {
        withSpecId: 'lib-acoustic-picket',
        role: 'track-data',
        confidence: 'probable',
        note: 'LAPIS is built to ingest low-altitude passive sensors on the Ukraine model via Legion open APIs.',
        source: 'Picogrid LAPIS material, 2026',
      },
      {
        withSpecId: 'lib-rps42',
        role: 'track-data',
        confidence: 'probable',
        note: 'Legion is radar-agnostic and fuses radar tracks locally, though a Picogrid-RPS-42 pairing is not named directly.',
        source: 'Picogrid Jun 2026; Militarnyi Nov 2025',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-medusa',
        reason:
          'No documented Picogrid link to USAF MEDUSA; the published network list is Army-centric.',
      },
    ],
  },
  // USAF counter-sUAS enterprise C2. Breaking Defense 2020-21; Air & Space Forces Magazine.
  {
    specId: 'lib-medusa',
    program: 'USAF counter-sUAS enterprise C2; AFCENT air-base defense',
    protocols: ['faad-c2'],
    media: ['cable', 'fiber'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'JCO reporting states MEDUSA is fully interoperable with FAAD C2 under the single standard architecture.',
        source: 'Breaking Defense Jun 2020 and Feb 2021',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason:
          'No documented MEDUSA-Lattice interoperability; both claim FAAD C2 compatibility instead.',
      },
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'Handheld point-and-shoot jammer with no network data interface; it cannot be tasked by or report into MEDUSA.',
      },
      {
        withSpecId: 'lib-thor',
        reason:
          'No public reporting shows THOR netted into MEDUSA; AFRL ran THOR with its own operator console.',
      },
      {
        withSpecId: 'lib-coyote',
        reason:
          'Coyote is fired by Army LIDS batteries under FAAD C2/KuRFS; MEDUSA involvement would be air-picture sharing only.',
      },
    ],
  },
  // Perennial Autonomy Merops; Ukraine and CENTCOM employment. Militarnyi Nov 2025; Picogrid Jun 2026.
  {
    specId: 'lib-merops',
    program: 'Perennial Autonomy Merops; Ukraine counter-Shahed; CENTCOM base defense',
    protocols: [],
    media: ['proprietary-rf', 'operator-manual', 'cable'],
    standalone: true,
    guidance: 'self',
    pairs: [
      {
        withSpecId: 'lib-rps42',
        role: 'cue',
        confidence: 'documented',
        note: 'US Army integrated Merops with the RADA RPS-42 radar during Operation Eastern Sentry demonstrations in Poland.',
        source: 'Militarnyi, Nov 2025',
      },
      {
        withSpecId: 'lib-picogrid',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Picogrid Legion/ECNs fuse radar tracks at the edge and cue Merops in automated detect-to-engage workflows.',
        source: 'Picogrid newsroom, Jun 2026; Tectonic Defense',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'Merops edge data reaches FAAD C2 classified networks through Picogrid cross-domain solution.',
        source: 'Picogrid newsroom, Jun 2026',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'cue',
        confidence: 'probable',
        note: 'CENTCOM layered-defense reporting describes Merops integration through FAAD C2 and increasingly Lattice.',
        source: 'flightbrief.news 2026; Picogrid/sUAS News Jun 2026',
      },
      {
        withSpecId: 'lib-acoustic-picket',
        role: 'alert',
        confidence: 'probable',
        note: 'Ukrainian counter-Shahed interceptor operations are cued by nationwide acoustic sensor networks.',
        source: 'TWZ Ukraine reporting; FPRI Mar 2026',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'In the CENTCOM architecture Merops sits beside the KuRFS+Coyote layer, sharing the picture through FAAD C2.',
        source: 'flightbrief.news 2026',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Coexists with Coyote as a cheaper counter-Shahed layer at the same sites, deconflicted via FAAD C2.',
        source: 'Defense News Apr 2026; TWZ 2026',
      },
    ],
  },
  // DIU prototype -> NCR-IADS ERSA camera modernization. DIU 2023; GovConWire 2023.
  {
    specId: 'lib-teleidoscope',
    program: 'NCR-IADS ERSA camera modernization (JADOC)',
    protocols: [],
    media: ['fiber', 'operator-manual'],
    standalone: true,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No published FAAD C2 integration; the fielded system reports into the NCR-IADS/JADOC architecture.',
      },
      { withSpecId: 'lib-lattice', reason: 'No documented Teleidoscope-Lattice integration.' },
      {
        withSpecId: 'lib-kurfs',
        reason: 'Open sources do not confirm Teleidoscope cameras in the FS-LIDS/KuRFS stack.',
      },
    ],
  },
  // USMC L-MADIS / MADIS Mk2 EW. TWZ 2019; GlobalSecurity L-MADIS.
  {
    specId: 'lib-modi',
    program: 'USMC L-MADIS / MADIS Mk2 mounted EW; dismounted CREW jammer',
    protocols: [],
    media: ['cable', 'operator-manual'],
    standalone: true,
    guidance: 'operator',
    pairs: [
      {
        withSpecId: 'lib-rps42',
        role: 'cue',
        confidence: 'documented',
        note: 'RPS-42 detects and cues the operator, who engages with Modi II on the same vehicle.',
        source: 'TWZ 2019; GlobalSecurity L-MADIS',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'The Army selected L-MADIS (with Modi) as interim mounted C-sUAS and mandated FAAD C2 as common interim C2.',
        source: 'army.mil 2020',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason:
          'No public documentation of a Modi-Lattice integration; the MADIS C2 path is CAC2S/MACCS.',
      },
      {
        withSpecId: 'lib-dronebuster',
        reason: 'Both are jammers; no machine-to-machine integration exists or is needed.',
      },
    ],
  },
  // JCO-approved handheld EA. Flex Force datasheet; airforce-technology profile.
  {
    specId: 'lib-dronebuster',
    program: 'JCO-approved handheld EA (Block 3B)',
    protocols: [],
    media: ['operator-manual'],
    standalone: true,
    guidance: 'operator',
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'Block 3B has no network interface; cueing is procedural voice/radio to the operator.',
      },
      {
        withSpecId: 'lib-rfone',
        reason:
          'An RF sensor can alert the sentry only by voice/procedure; there is no technical integration.',
      },
      {
        withSpecId: 'lib-rf360',
        reason: 'Human-in-the-loop procedural cue only; no machine interface on the handheld.',
      },
      { withSpecId: 'lib-modi', reason: 'No integration between the two jammers.' },
    ],
  },
  // D-Fend EnforceAir; JCO installation-defense recommendation. Unmanned Airspace 2022.
  {
    specId: 'lib-enforceair',
    program: 'JCO installation-defense recommendation (via SAIC C2)',
    protocols: ['cot-tak'],
    media: ['cable', 'mesh-radio'],
    standalone: true,
    guidance: 'self',
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No public FAAD C2 integration kit; the documented DoD fielding path is via SAIC C2.',
      },
      {
        withSpecId: 'lib-rf360',
        reason:
          'Dedrone is a direct competitor with its own RF-cyber stack; no documented interoperability.',
      },
      {
        withSpecId: 'lib-medusa',
        reason: 'No public documentation of EnforceAir on the USAF MEDUSA network.',
      },
      {
        withSpecId: 'lib-lattice',
        reason: 'No documented EnforceAir-Lattice integration as of mid-2026.',
      },
    ],
  },
  // Smart Shooter SMASH 2000L. Army Recognition 2026; Smart Shooter documentation.
  {
    specId: 'lib-smash',
    program: 'Army Individual C-sUAS; USMC squad-level C-UAS',
    protocols: [],
    media: ['operator-manual', 'cable'],
    standalone: true,
    guidance: 'operator',
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No documented FAAD C2 integration; the 2000LE advertises BMS connectivity but no public FAAD C2 kit exists.',
      },
      {
        withSpecId: 'lib-rps42',
        reason:
          'No documented machine cue from air-surveillance radars to the rifle optic; cueing is procedural.',
      },
      {
        withSpecId: 'lib-dronebuster',
        reason: 'Both are last-line individual weapons; no integration between them.',
      },
    ],
  },
  // Army RCCTO P-HEL (BlueHalo LOCUST). BlueHalo/PRNewswire 2024; military.com 2024.
  {
    specId: 'lib-phel',
    program: 'Army RCCTO P-HEL (BlueHalo LOCUST LWS)',
    protocols: ['faad-c2'],
    media: ['cable', 'operator-manual'],
    standalone: true,
    guidance: 'self',
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        note: 'BlueHalo states systems employing LOCUST LWS are fully integrated with the Army FAAD C2 network.',
        source: 'BlueHalo/PRNewswire 2024; military.com 2024',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'cue',
        confidence: 'probable',
        note: 'At fixed CENTCOM sites KuRFS feeds FAAD C2, which can cue P-HEL through track correlation.',
        source: 'RTX LIDS 2024; military.com 2024',
      },
      {
        withSpecId: 'lib-lstar',
        role: 'cue',
        confidence: 'probable',
        note: 'AN/TPQ-50 is a standard FAAD C2-fed C-sUAS radar whose tracks can cue P-HEL through the shared network.',
      },
      {
        withSpecId: 'lib-tpq53',
        role: 'cue',
        confidence: 'probable',
        note: 'AN/TPQ-53 in air-surveillance mode reports into FAAD C2 and can cue P-HEL indirectly through it.',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'P-HEL and LIDS/Coyote batteries share the FAAD C2 network at protected sites for layered defense.',
      },
    ],
  },
  // Epirus IFPC-HPM. Epirus press 2023; army-technology Leonidas profile.
  {
    specId: 'lib-leonidas',
    program: 'Army RCCTO IFPC-HPM (Epirus Leonidas)',
    protocols: ['faad-c2', 'lattice'],
    media: ['cable'],
    standalone: false,
    guidance: 'c2-cue',
    pairs: [
      {
        withSpecId: 'lib-lattice',
        role: 'engage-order',
        confidence: 'documented',
        note: 'Leonidas ingests timing, radar track data, and commands through Lattice to lock and track designated targets.',
        source: 'Epirus press release 2023; Defense Advancement 2023',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        note: 'Leonidas open architecture integrates with FAAD C2 so existing air-defense sensors cue the HPM.',
        source: 'army-technology.com Leonidas profile',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'cue',
        confidence: 'probable',
        note: 'IFPC-HPM emplacements on FAAD C2 sites can take KuRFS tracks as cue through FAAD C2.',
      },
      {
        withSpecId: 'lib-anvil',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Both are Lattice-controlled effectors, so layered HPM-plus-kinetic engagement under one picture is near-certain.',
      },
      {
        withSpecId: 'lib-roadrunner',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Shared-C2 layered defense with Lattice-integrated Roadrunner-M is near-certain, though not demonstrated together.',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lpws',
        reason:
          'No documented Leonidas-C-RAM integration; intercept deconfliction with an HPM field is unaddressed publicly.',
      },
    ],
  },
  // AFRL experimental HPM. Shephard Media; JED 2023; AFRL releases.
  {
    specId: 'lib-thor',
    program: 'AFRL experimental HPM for air-base defense',
    protocols: ['faad-c2'],
    media: ['cable', 'operator-manual'],
    standalone: true,
    guidance: 'self',
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'cue',
        confidence: 'documented',
        note: 'In AFRL evaluation a C-UAS radar chain exported tracks to FAAD C2 to cue THOR, which neutralized multiple UAS.',
        source: 'Shephard Media; JED 2023',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-medusa',
        reason: 'No public reporting shows THOR on the USAF MEDUSA C-sUAS network.',
      },
      {
        withSpecId: 'lib-leonidas',
        reason: 'Competing HPM approaches; no integration between them.',
      },
    ],
  },
  // Echodyne EchoShield; USAF SUADS; Red Sands 2025. Defense Advancement 2025.
  {
    specId: 'lib-echoshield',
    program: 'Echodyne commercial; USAF SUADS; Red Sands 2025',
    protocols: ['faad-c2', 'sapient'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'At Red Sands 2025 EchoShield track data was pushed to FAAD C2 and used to slew-to-cue optics.',
        source: 'Defense Advancement, 2025',
      },
      {
        withSpecId: 'lib-rfone',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Rapid-deploy DroneSentry configs pair EchoShield radars with DroneShield RF sensors under SensorFusionAI.',
        source: 'UASweekly, Mar 2025',
      },
      {
        withSpecId: 'lib-rf360',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Echodyne radar is fused with Dedrone RF sensors in DedroneTracker.AI (DedroneTower configuration).',
        source: 'dedrone.com technology partners',
      },
      {
        withSpecId: 'lib-leonidas',
        role: 'cue',
        confidence: 'documented',
        note: 'DroneSentry-C2 integrates Echodyne radars alongside the Leonidas HPM effector; radar tracks cue the HPM.',
        source: 'UASweekly, Mar 2025',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Anduril Sentry towers historically used Echodyne radars; an EchoShield-specific integration is not published.',
        source: 'Defense News, Jul 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'Cannot substitute for KuRFS: Coyote guidance depends on the Ku-band fire-control uplink, which EchoShield does not provide.',
      },
    ],
  },
  // Robin Radar IRIS; Ukraine at scale; NATO TIE23. robinradar.com 2023.
  {
    specId: 'lib-iris',
    program: 'Robin Radar commercial; Ukraine employment; NATO TIE23',
    protocols: ['sapient'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-rf360',
        role: 'track-data',
        confidence: 'documented',
        note: 'IRIS radar tracks feed the DedroneTracker fusion engine, fusing with Dedrone RF sensors.',
        source: 'robinradar.com NATO TIE23, 2023',
      },
      {
        withSpecId: 'lib-rfone',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'The Robin Radar-DroneShield partnership makes IRIS a supported radar in DroneSentry-C2.',
        source: 'Robin Radar / DroneShield press, Mar 2026',
      },
      {
        withSpecId: 'lib-discovair',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Both vendors publish SAPIENT support and both integrate in DroneSentry-C2, so plug-level interop is near-certain.',
        source: 'robinradar.com TIE23; sqhead.com',
      },
      {
        withSpecId: 'lib-acoustic-picket',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Both feed Ukraine national air picture; fusion happens at the C2 layer, not sensor-to-sensor.',
        source: 'The Defense Post Sep 2025; Defense One Jul 2024',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason: 'Provides surveillance/cue-grade 3D tracks only; no Coyote fire-control datalink.',
      },
    ],
  },
  // Teledyne FLIR R8SS-3D; Swedish critical-infrastructure install. Unmanned Airspace 2022.
  {
    specId: 'lib-r8ss',
    program: 'Teledyne FLIR commercial; Cameleon C2 ecosystem',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-hdcmr',
        role: 'cue',
        confidence: 'documented',
        note: 'The R8SS-3D radar automatically slews-to-cue the Ranger HDC MR thermal camera under FLIR Cameleon C2.',
        source: 'Unmanned Airspace, 2022',
      },
      {
        withSpecId: 'lib-rfone',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Teledyne FLIR is a listed detection partner in the DroneSentry-C2 ecosystem.',
        source: 'UASweekly, Mar 2025',
      },
    ],
  },
  // DroneShield RfOne; DroneSentry-C2 ecosystem. UASweekly Mar 2025; DroneShield press.
  {
    specId: 'lib-rfone',
    program: 'DroneShield commercial; DroneSentry-C2 ecosystem',
    protocols: ['sapient', 'cot-tak'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-echoshield',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'EchoShield radars fuse with DroneShield RF sensors in DroneSentry-C2 rapid-deploy configurations.',
        source: 'UASweekly, Mar 2025',
      },
      {
        withSpecId: 'lib-iris',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Robin Radar IRIS was added to the DroneSentry-C2 SensorFusionAI marketplace; RF cues fuse with radar tracks.',
        source: 'DroneShield / Robin Radar press, Mar 2026',
      },
      {
        withSpecId: 'lib-discovair',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'The Discovair G2 acoustic array is integrated with DroneShield products in DroneSentry-C2.',
        source: 'DroneShield-Squarehead PR; HSToday',
      },
      {
        withSpecId: 'lib-leonidas',
        role: 'cue',
        confidence: 'documented',
        note: 'Leonidas HPM is integrated as an effector in DroneSentry-C2; RF and radar detections cue the engagement.',
        source: 'UASweekly, Mar 2025',
      },
      {
        withSpecId: 'lib-hdcmr',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Teledyne FLIR is a listed DroneSentry-C2 detection partner; the HDC MR-specific pairing is not published.',
        source: 'UASweekly, Mar 2025',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'Any cue from RfOne detections reaches the jammer operator only verbally, not as a machine link.',
      },
      {
        withSpecId: 'lib-coyote',
        reason:
          'Passive RF direction-finding yields bearing, not a fire-control track; cannot support Coyote guidance.',
      },
    ],
  },
  // Dedrone RF-360 (Axon). dedrone.com partners; robinradar.com TIE23.
  {
    specId: 'lib-rf360',
    program: 'Dedrone by Axon commercial; Ukraine family employment',
    protocols: [],
    media: ['cable', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-echoshield',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'RF-360 detections fuse with Echodyne radar tracks in DedroneTracker.AI (DedroneTower).',
        source: 'dedrone.com technology partners',
      },
      {
        withSpecId: 'lib-iris',
        role: 'track-data',
        confidence: 'documented',
        note: 'Robin Radar IRIS feeds the DedroneTracker fusion engine, fusing with Dedrone RF sensors.',
        source: 'robinradar.com NATO TIE23, 2023',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason: 'No public FAAD C2 integration for DedroneTracker/RF-360.',
      },
    ],
  },
  // Squarehead Discovair G2. DroneShield-Squarehead PR; HSToday.
  {
    specId: 'lib-discovair',
    program: 'Squarehead commercial; US DoD test with DroneShield',
    protocols: ['sapient'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-rfone',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Discovair G2 is integrated with DroneShield RF, radar, and camera products in DroneSentry-C2.',
        source: 'DroneShield-Squarehead PR; HSToday',
      },
      {
        withSpecId: 'lib-iris',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Both are SAPIENT-supporting sensors integrated with DroneSentry-C2, so standards-level interop is near-certain.',
        source: 'sqhead.com; robinradar.com TIE23',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'Acoustic direction-finding cannot generate a fire-control-grade track or datalink.',
      },
    ],
  },
  // Ukraine Sky Fortress class acoustic picket. Defense One Jul 2024; The Defense Post Sep 2025.
  {
    specId: 'lib-acoustic-picket',
    program: 'Ukraine national air defense (Sky Fortress class)',
    protocols: [],
    media: ['mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-iris',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Acoustic tracks and IRIS radar tracks both feed the Ukrainian national air picture at the C2 layer.',
        source: 'Defense One Jul 2024; The Defense Post Sep 2025',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No public evidence Sky Fortress was integrated into FAAD C2; it delivers its picture via its own cloud application.',
      },
      {
        withSpecId: 'lib-merops',
        reason:
          'No published link between acoustic picket cueing and Merops interceptor employment.',
      },
    ],
  },
  // Teledyne FLIR Ranger HDC MR. Unmanned Airspace 2022; UASweekly Mar 2025.
  {
    specId: 'lib-hdcmr',
    program: 'Teledyne FLIR commercial; Cameleon C2 ecosystem',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-r8ss',
        role: 'cue',
        confidence: 'documented',
        note: 'Receives automatic slew-to-cue from the R8SS-3D radar under FLIR Cameleon C2.',
        source: 'Unmanned Airspace, 2022',
      },
      {
        withSpecId: 'lib-rfone',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Teledyne FLIR is a listed detection partner in DroneSentry-C2.',
        source: 'UASweekly, Mar 2025',
      },
      {
        withSpecId: 'lib-echoshield',
        role: 'cue',
        confidence: 'probable',
        note: 'Both are integrated members of the DroneSentry-C2 ecosystem, so radar-cue-to-camera pairing is near-certain.',
      },
    ],
  },
  // Integrated Battle Command System. IBCS - Transforming Integrated Air and Missile Defense (Northrop Grumman overview)
  {
    specId: 'lib-ibcs',
    program:
      'Army AIAMD modernization; IOC and full-rate production Apr 2023; IBCS-M maneuver C-UAS variant',
    protocols: ['link-16'],
    media: ['fiber', 'cable', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Northrop states FAAD C2 will converge into IBCS, which will replace Army Patriot, THAAD and FAAD C2 systems; a fielded bidirectional FAAD C2-IBCS data link is not published.',
        source: 'NG IBCS overview 2023; NG FAAD C2 infographic NG23-0503-0384, 2023',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Army selected Anduril Lattice as the next-generation fire-control platform for the IBCS Maneuver (IBCS-M) C-UAS program.',
        source: 'DefenseScoop, 11 Nov 2025',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'IBCS interceptor integration is published for Patriot/PAC-3, IFPC and allied CAMM; no public IBCS-Coyote fire-control interface exists.',
      },
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'Handheld point-and-shoot jammer with no data interface; it cannot join the Integrated Fire Control Network.',
      },
    ],
  },
  // Air Defense Systems Integrator. Air Defense Systems Integrator ADSI datasheet (1003.6-I&C-en-REV0723)
  {
    specId: 'lib-adsi',
    program:
      'Ultra I&C ADSI; 2020 DoD C-sUAS C2 selection as a FAAD C2-interoperable C2; first C2 gateway with a continuous ATO (2024)',
    protocols: ['link-16'],
    media: ['cable', 'fiber', 'serial', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'ADSI carries the Forward Area Air Defense (FAAD) data link as a named interface, and the 2020 DoD C-sUAS C2 selection listed ADSI as a FAAD C2-interoperable system.',
        source: 'Ultra ADSI datasheet Jul 2023; army.mil C-sUAS selection Jun 2020',
      },
      {
        withSpecId: 'lib-tak',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'ADSI names Cursor on Target as a supported interface and performs CoT to JREAP-C translation.',
        source: 'Ultra ADSI datasheet Jul 2023; Breaking Defense Dec 2024',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'ADSI forwards and correlates link tracks; it holds no interceptor fire-control uplink. Coyote is guided through KuRFS under FAAD C2.',
      },
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'Handheld jammer with no data-link interface; nothing for a link gateway to forward to.',
      },
    ],
  },
  // Team Awareness Kit. Defense Threat Reduction Agency transitions new situational awareness tool to C5ISR Center's TAK Product Center (army.mil); Tactical Awareness Kit (TAK): Ultimate Guide
  {
    specId: 'lib-tak',
    program:
      'C5ISR Center TAK Product Center; AFRL origin 2010; supports 15 DoD programs of record',
    protocols: [],
    media: ['mesh-radio', 'cable'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-dronesentryc2',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'DroneShield implemented Cursor-on-Target in DroneSentry-C2 to stream detections to TAK servers; the RfLink ATAK-CIV plugin renders RF detections and line of bearing in ATAK.',
        source: 'DroneShield/Unmanned Airspace Feb 2022; DroneShield Q2 2026 release Apr 2026',
      },
      {
        withSpecId: 'lib-rfone',
        role: 'alert',
        confidence: 'documented',
        note: 'RfOne implemented the CoT protocol to push RF detections into TAK; bearing-only alerts, not a track.',
        source: 'DroneShield/Unmanned Airspace, 1 Feb 2022',
      },
      {
        withSpecId: 'lib-picogrid',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Picogrid LAPIS and Legion support direct integration with TAK alongside FAAD C2, Lattice, NGC2 and Maven.',
        source: 'Picogrid newsroom / sUAS News, Jun 2026',
      },
      {
        withSpecId: 'lib-adsi',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'ADSI names CoT as a supported interface and translates CoT to JREAP-C, bridging TAK into the link architecture.',
        source: 'Ultra ADSI datasheet Jul 2023; Breaking Defense Dec 2024',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Northrop lists Cursor on Target among FAAD C2 supported external systems.',
        source: 'NG FAAD C2 infographic NG23-0503-0384, 2023',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'TAK carries CoT situational awareness, not fire-control quality tracks; it cannot cue or guide an interceptor.',
      },
      {
        withSpecId: 'lib-lpws',
        reason:
          'LPWS is commanded through FAAD C2 in the C-RAM system of systems; no TAK engagement path exists.',
      },
      {
        withSpecId: 'lib-lattice',
        reason:
          "No published Lattice CoT or TAK interface. Anduril's developer documentation names only the Entities, Tasks and Objects APIs over REST and gRPC.",
      },
    ],
  },
  // DroneSentry-C2. Counter-UAS Systems Software & Analytics (DroneShield)
  {
    specId: 'lib-dronesentryc2',
    program: 'DroneShield DroneSentry layered defence; DroneSentry-C2 Enterprise from Oct 2025',
    protocols: ['sapient'],
    media: ['cable', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-rfone',
        role: 'track-data',
        confidence: 'documented',
        note: 'RfOne Mk2 is a DroneShield RF sensor natively fused by SensorFusionAI inside DroneSentry-C2.',
        source: 'DroneShield products-software page; DroneShield TAK release Feb 2022',
      },
      {
        withSpecId: 'lib-echoshield',
        role: 'track-data',
        confidence: 'probable',
        note: 'Named partner sensor; the specific pairing is not published.',
        source: 'UASweekly Mar 2025; DroneShield products-software page',
      },
      {
        withSpecId: 'lib-iris',
        role: 'track-data',
        confidence: 'probable',
        note: 'Named partner sensor; the specific pairing is not published.',
        source: 'DroneShield / Robin Radar press, Mar 2026',
      },
      {
        withSpecId: 'lib-discovair',
        role: 'track-data',
        confidence: 'documented',
        note: 'The Squarehead Discovair G2 acoustic array is integrated with DroneShield products in DroneSentry-C2.',
        source: 'DroneShield-Squarehead PR; HSToday',
      },
      {
        withSpecId: 'lib-leonidas',
        role: 'engage-order',
        confidence: 'documented',
        note: 'Leonidas HPM is integrated as an effector in DroneSentry-C2; fused RF and radar detections cue the engagement.',
        source: 'UASweekly, Mar 2025',
      },
      {
        withSpecId: 'lib-tak',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'DroneSentry-C2 implements Cursor-on-Target to stream the C-UAS picture to TAK servers; RfLink renders detections inside ATAK-CIV.',
        source: 'Unmanned Airspace Feb 2022; DroneShield Q2 2026 release',
      },
      {
        withSpecId: 'lib-rps42',
        role: 'track-data',
        confidence: 'probable',
        note: 'DroneShield names RADA among its sensor interoperability partners; the RPS-42-specific pairing is not published.',
        source: 'DroneShield products-software page, 2026',
      },
      {
        withSpecId: 'lib-hdcmr',
        role: 'track-data',
        confidence: 'probable',
        note: 'Teledyne FLIR is a named DroneSentry-C2 sensor interoperability partner; the Ranger HDC MR-specific pairing is not published.',
        source: 'DroneShield products-software page, 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'Commercial C2 with no interceptor fire-control uplink; Coyote is guided by KuRFS under FAAD C2.',
      },
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'Third-party handheld point-and-shoot jammer with no C2 data interface; it cannot be tasked from DroneSentry-C2.',
      },
    ],
  },
  // DedroneTracker.AI. Dedrone Launches DedroneTracker.AI: AI-Driven Counterdrone C2 Platform
  {
    specId: 'lib-dedronetracker',
    program: 'Dedrone by Axon commercial; DedroneTracker.AI v6 from Jul 2023',
    protocols: [],
    media: ['cable', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-rf360',
        role: 'track-data',
        confidence: 'documented',
        note: "RF-360 is Dedrone's own passive RF sensor; its detections fuse inside DedroneTracker.AI.",
        source: 'dedrone.com product pages, 2026',
      },
      {
        withSpecId: 'lib-echoshield',
        role: 'track-data',
        confidence: 'probable',
        note: 'Named partner sensor; the specific pairing is not published.',
        source: 'dedrone.com technology partners',
      },
      {
        withSpecId: 'lib-iris',
        role: 'track-data',
        confidence: 'probable',
        note: 'Named partner sensor; the specific pairing is not published.',
        source: 'robinradar.com NATO TIE23, 2023; dedrone.com partners',
      },
      {
        withSpecId: 'lib-hdcmr',
        role: 'track-data',
        confidence: 'probable',
        note: 'FLIR is a named Dedrone sensor partner; the Ranger HDC MR-specific pairing is not published.',
        source: 'dedrone.com drone-detection-software, 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          "No public FAAD C2 integration for DedroneTracker.AI; Northrop's published FAAD C2 sensor and external-system lists do not name Dedrone.",
      },
      {
        withSpecId: 'lib-coyote',
        reason: 'Commercial airspace-security C2 with no interceptor fire-control uplink.',
      },
    ],
  },
  // Army Multi-Purpose High Energy Laser (AMP-HEL). AV Delivers First Two Multi-Purpose High Energy Laser Systems to U.S. Army
  {
    specId: 'lib-amphel',
    program: 'US Army RCCTO AMP-HEL prototyping (AV LOCUST LWS on ISV and JLTV)',
    protocols: ['faad-c2'],
    media: ['mesh-radio', 'cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'inferred',
        medium: 'mesh-radio',
        note: 'The LOCUST subsystem is FAAD-integrated; AMP-HEL-specific integration is not separately documented.',
        source: 'AV, 31 Aug 2025; BlueHalo/PRNewswire, 2024',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'c2-interop',
        confidence: 'inferred',
        note: 'Falls under the Army enterprise C-UAS C2 transition from FAAD C2 to Lattice. No AMP-HEL-specific pairing is published.',
        source: 'DefenseScoop, Mar 2026',
      },
    ],
    guidance: 'self',
  },
  // High Energy Laser with Integrated Optical-dazzler and Surveillance (HELIOS), Mk 5 Mod 0. CRS R46925 / Navy budget material via CRS; TWZ 'USS Preble Used HELIOS Laser To Zap Four Drones'
  {
    specId: 'lib-helios',
    program: 'US Navy Surface Navy Laser Weapon System Increment 1 (HELIOS, Mk 5 Mod 0)',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'HELIOS is fire-controlled by the ship Aegis Combat System. No public source puts it on the Army FAAD C2 network.',
      },
      { withSpecId: 'lib-lattice', reason: 'No public source puts HELIOS on Lattice.' },
    ],
    guidance: 'self',
  },
  // Iron Beam (Or Eitan). Breaking Defense, 'Lasers in the field: Iron Beam clears last test before operational use' and 'Israel's new laser system goes active'
  {
    specId: 'lib-ironbeam',
    program: 'Israeli MoD / Rafael Iron Beam (Or Eitan) laser air defence',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'Iron Beam is cued through the Israeli multi-layer air-defence array and Iron Dome command and control, not FAAD C2.',
      },
      { withSpecId: 'lib-lattice', reason: 'No public source puts Iron Beam on Lattice.' },
    ],
    guidance: 'self',
  },
  // Wide-Area Infrared Sensing with Persistence (WISP). Anduril to use artificial intelligence (AI) and sensor fusion for IR-based counter-UAV perimeter security
  {
    specId: 'lib-wisp',
    program:
      'Anduril Lattice C-UAS; USAF AFTC order Dec 2023; Washington National Guard fielding Aug 2026',
    protocols: ['lattice'],
    media: ['cable', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'documented',
        medium: 'cable',
        note: 'WISP detections feed Lattice, which fuses them with tower video and Pulsar RF tracks into one picture.',
        source: 'Defence Industry Europe, Aug 2026; Army Recognition, Aug 2026',
      },
      {
        withSpecId: 'lib-anvil',
        role: 'cue',
        confidence: 'probable',
        medium: 'cable',
        note: 'Anvil is tasked only through Lattice, and WISP is a Lattice sensor in the same Anduril kits.',
        source: 'Anduril Anvil page; The Defense Post Oct 2025',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'probable',
        note: 'Northrop lists WISP among FAAD C2 supported sensors; the sheet does not expand the name.',
        source: 'Northrop Grumman FAAD C2 infographic NG23-0503-0384, 2023',
      },
    ],
  },
  // L3Harris WESCAM MX-GCS Independent Stabilized Sighting System. WESCAM MX-GCS, Independent Stabilized Sighting Systems
  {
    specId: 'lib-mxgcs',
    program:
      'US Army SGT Stout M-SHORAD Mission Equipment Package (Leonardo DRS integrator, L3Harris sensor)',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-rps42',
        role: 'cue',
        confidence: 'documented',
        medium: 'cable',
        note: 'MHR radar and MX-GCS EO/IR ride the same SGT Stout mission equipment package; the radar provides the 360 deg surveillance that slews the sight.',
        source: 'Leonardo DRS SGT Stout data sheet, Dec 2025',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'fc-uplink',
        confidence: 'documented',
        medium: 'cable',
        note: 'MX-GCS is the stabilised sighting system for the RIwP turret that carries the XM914 30 mm gun.',
        source: 'Leonardo DRS SGT Stout data sheet, Dec 2025',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'probable',
        medium: 'cable',
        note: "SGT Stout 'integrates with existing Army networks and interoperable with Sentinel radar'; FAAD C2 is the Army SHORAD C2 those networks run on, but the sheet does not name it.",
        source: 'Leonardo DRS SGT Stout data sheet, Dec 2025',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason:
          'No published Lattice integration for the SGT Stout mission equipment package; its C2 path is the Army air-defence network.',
      },
    ],
  },
  // HGH Infrared Systems Spynel-S 6000. Counter-UAS 101 - Electro-Optical and Infrared Detection
  {
    specId: 'lib-spynel',
    program: 'HGH commercial; Cyclope video analytics suite',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason: 'No published FAAD C2 integration for Spynel; its native C2 layer is HGH Cyclope.',
      },
      { withSpecId: 'lib-lattice', reason: 'No published Lattice integration for Spynel.' },
    ],
  },
  // Zvook acoustic early-warning station. Ukraine Develops Acoustic Detector for FPV Drones
  {
    specId: 'lib-zvook',
    program:
      'Ukrainian national acoustic early-warning network (Delta); NATO BATT26 trial with Latvia, 2026',
    protocols: [],
    media: ['mesh-radio', 'cable'],
    standalone: false,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          "No public evidence of a FAAD C2 interface. Zvook delivers its picture into Ukraine's Delta system, which RangeBoard does not model.",
      },
      { withSpecId: 'lib-lattice', reason: 'No published Zvook-Lattice integration.' },
      {
        withSpecId: 'lib-merops',
        reason:
          'No published link between acoustic station cueing and Merops interceptor employment.',
      },
    ],
  },
  // Zvook NW0 tactical acoustic sensor. Ukraine Develops Acoustic Detector for FPV Drones
  {
    specId: 'lib-zvooknw0',
    program: 'Zvook tactical line-of-contact acoustic network',
    protocols: [],
    media: ['cable', 'fiber', 'mesh-radio'],
    standalone: false,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          "No FAAD C2 interface published; the sensor reports into the vendor's own Zvook UI map.",
      },
      { withSpecId: 'lib-lattice', reason: 'No published Zvook-Lattice integration.' },
    ],
  },
  // Counter-small Unmanned Aircraft Electronic Warfare System (Direction Finding). SRC, LIDS Family of Systems brochure (marked Approved for Public Release)
  {
    specId: 'lib-cuaews',
    program: 'Army LIDS / FS-LIDS / M-LIDS EW element (SRC CUAEWS DF)',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        medium: 'cable',
        note: 'In LIDS all sensors and effectors are correlated through FAAD C2, which provides the fratricide-avoidance and integrated air picture the EW engagement runs under.',
        source: 'SRC LIDS Family of Systems brochure (Approved for Public Release), 2021',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'cue',
        confidence: 'documented',
        medium: 'cable',
        note: 'KuRFS/KuMRFS is the LIDS air-surveillance and fire-control radar; its track feeds the same LIDS picture the operator uses to task the EW effector.',
        source: 'SRC LIDS Family of Systems brochure, 2021; RTX LIDS overview, Feb 2024',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Published LIDS layered sequence: Coyote Block 2+ to about 15 km, then EW effects to about 8 km, then the 30 mm gun as final protection.',
        source: 'SRC LIDS Family of Systems brochure, 2021',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'XM914 30 mm is the innermost LIDS layer behind the EW belt; both are tasked from the same FAAD C2 engagement plan.',
        source: 'SRC LIDS Family of Systems brochure, 2021',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason: 'No published CUAEWS-Lattice integration. The documented LIDS C2 path is FAAD C2.',
      },
      {
        withSpecId: 'lib-tpq53',
        reason:
          'LIDS pairs CUAEWS with the AN/TPQ-50 MMR, not the AN/TPQ-53; the two radars are different systems and no TPQ-53 pairing is published.',
      },
    ],
    guidance: 'self',
  },
  // Negation of Improvised Non-State Joint Aerial Threats. Leonardo press release, UK-US counter-drone collaboration (relative range statement only)
  {
    specId: 'lib-ninja',
    program: 'US Air Force C-sUAS program of record (AFRL NINJA); JCO interim fixed-site selection',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'probable',
        medium: 'cable',
        note: "NINJA was one of the JCO's interim C-sUAS selections, and the JCO mandated a common interim C2; no NINJA-specific FAAD C2 integration kit is published.",
        source: 'army.mil Jun 2020 (JCO interim selections); CRS R48477, Mar 2025',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason:
          "No documented NINJA-Lattice integration. The vendor's published C2 partnership is with UNIFY.C2 (Feb 2026), which is not in this library.",
      },
      {
        withSpecId: 'lib-modi',
        reason: 'Both are EW effectors; no machine-to-machine integration exists or is needed.',
      },
    ],
    guidance: 'self',
  },
  // Pulsar electromagnetic warfare system. Army Recognition, US Anduril Reveals Pulsar Electronic Warfare System for 360 Anti-Drone Defense at WDS 2026
  {
    specId: 'lib-pulsar',
    program: 'Anduril Pulsar EW family; SOCOM C-UAS IDIQ (Pulsar, Lattice, Sentry Tower, Anvil)',
    protocols: ['lattice'],
    media: ['cable', 'mesh-radio'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-lattice',
        role: 'engage-order',
        confidence: 'documented',
        medium: 'mesh-radio',
        note: "Pulsar is the RF sensing and EW defeat element of Anduril's base-defense architecture, managed through the Lattice C2 layer.",
        source: 'Anduril Pulsar-L release, Apr 2025; Army Recognition WDS 2026',
      },
      {
        withSpecId: 'lib-anvil',
        role: 'c2-interop',
        confidence: 'inferred',
        note: 'Shared presence on one IDIQ is not a published configuration.',
        source: 'SOCOM C-UAS IDIQ reporting covering Pulsar, Lattice, Sentry Tower and Anvil',
      },
      {
        withSpecId: 'lib-roadrunner',
        role: 'c2-interop',
        confidence: 'inferred',
        note: 'Shared presence on one IDIQ is not a published configuration.',
        source: 'SOCOM C-UAS IDIQ reporting',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason: "No documented Pulsar-FAAD C2 integration; Anduril's published C2 path is Lattice.",
      },
      {
        withSpecId: 'lib-medusa',
        reason:
          "No public reporting nets Pulsar into MEDUSA; MEDUSA's published interoperability is with FAAD C2.",
      },
    ],
    guidance: 'self',
  },
  // Pitbull 101 RF Jammer. MyDefence, Pitbull Drone Jammer product page; corroborated by European Security & Defence
  {
    specId: 'lib-pitbull',
    program: 'MyDefence Soldier Kit (Wingman 103/105 + Pitbull 100/101); US Army order Jul 2025',
    protocols: ['cot-tak'],
    media: ['proprietary-rf', 'operator-manual'],
    standalone: true,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'Wearable jammer with no FAAD C2 interface; its only machine cue is the paired MyDefence Wingman detector, which is not in this library.',
      },
      { withSpecId: 'lib-lattice', reason: 'No published Pitbull-Lattice integration.' },
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'Both are dismounted jammers; no machine-to-machine integration exists or is needed.',
      },
      {
        withSpecId: 'lib-modi',
        reason: 'Both are dismounted EW systems; no integration is published.',
      },
    ],
    guidance: 'operator',
  },
  // Common Aviation Command and Control System (CAC2S). General Dynamics Mission Systems, Common Aviation Command & Control System (CAC2S) product page
  {
    specId: 'lib-cac2s',
    program:
      'USMC MACCS modernisation (GD Mission Systems); C2 element of the Marine MRIC air-defence system',
    protocols: ['cac2s'],
    media: ['cable', 'fiber', 'mesh-radio'],
    standalone: false,
    pairs: [
      {
        withSpecId: 'lib-gator',
        role: 'track-data',
        confidence: 'documented',
        medium: 'fiber',
        note: 'CRS names G/ATOR and CAC2S as two of the three components of the Marine MRIC air-defence system; G/ATOR feeds the CAC2S air picture.',
        source: 'CRS R48477, 31 Mar 2025',
      },
      {
        withSpecId: 'lib-rps42',
        role: 'track-data',
        confidence: 'inferred',
        medium: 'cable',
        note: 'MADIS Mk2 and L-MADIS carry the RADA MHR family and are fought by LAAD battalions inside the MACCS that CAC2S serves. No source names a MADIS-to-CAC2S data interface, so this is an organisational association only.',
      },
      {
        withSpecId: 'lib-modi',
        role: 'cue',
        confidence: 'inferred',
        medium: 'operator-manual',
        note: 'Modi 2 is operator-employed on the L-MADIS EW vehicle off the section air picture. CAC2S supplies the picture the section fights on; it does not machine-task the jammer.',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-medusa',
        reason:
          'MEDUSA is the US Air Force base-defence C-sUAS C2. No published MEDUSA-CAC2S interface exists, and the two must not be substituted for one another: MEDUSA has no documented role on any Marine Corps vehicle.',
      },
      {
        withSpecId: 'lib-lattice',
        reason:
          'No published CAC2S-Lattice integration was found. Do not infer one from both being modern C2 platforms.',
      },
    ],
  },
  // Ku-band Multi-Mission RF System, Mobile (KuMRFS-M). SRC, LIDS Family of Systems brochure (marked Approved for Public Release), KuMRFS-M CAPABILITIES panel
  {
    specId: 'lib-kumrfs-m',
    program: 'Army LIDS / M-LIDS kinetic-defeat vehicle; KuMRFS family',
    protocols: ['faad-c2'],
    media: ['cable', 'proprietary-rf'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-coyote',
        role: 'fc-uplink',
        confidence: 'documented',
        medium: 'proprietary-rf',
        note: "Coyote Block 2+ 'is command and control guided to target using from the KuMRFS family of radars until the on-board seeker takes over'; KuMRFS-M is the masted radar on the same M-LIDS vehicle that carries the two-round Coyote launcher.",
        source:
          'SRC LIDS Family of Systems brochure (Approved for Public Release), Coyote and Mobile Solutions sections',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        medium: 'cable',
        note: "In LIDS 'all sensors and effectors are correlated with higher echelon through the Forward Area Air Defense Command and Control (FAAD C2) system'.",
        source: 'SRC LIDS Family of Systems brochure, capability description',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'cue',
        confidence: 'documented',
        medium: 'cable',
        note: 'The M-LIDS kinetic vehicle carries KuMRFS-M on the mast and the XM914E1 30 mm on the RIwP turret; the radar supplies the engagement track for the turret.',
        source: 'SRC LIDS Family of Systems brochure, two-vehicle M-LIDS system description',
      },
      {
        withSpecId: 'lib-drs-s3',
        role: 'cue',
        confidence: 'probable',
        medium: 'cable',
        note: 'Radar track slews the RIwP sight for visual identification before a kinetic engagement; both sit on the same vehicle, but the brochure does not describe the handover explicitly.',
      },
      {
        withSpecId: 'lib-cuaews',
        role: 'cue',
        confidence: 'probable',
        medium: 'mesh-radio',
        note: "The two M-LIDS vehicles fight as one section under FAAD C2, and the brochure's layered sequence runs Coyote to about 15 km, then EW effects to about 8 km, then the 30 mm gun.",
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Lattice replacing FAAD C2 as Army C-UAS fire control will have to ingest LIDS radars, but no KuMRFS-M-specific integration is published.',
      },
    ],
    denied: [],
  },
  // eXpeditionary Battlefield AESA External Unit (XBAEU). RangeBoard SENSOR_ROLE_DEFAULT_RANGE_M (src/model/types.ts) - basis only; RTX KuRFS product page confirms no published figure
  {
    specId: 'lib-xbaeu',
    program: 'Army M-LIDS Increment 2.1 (single Stryker)',
    protocols: ['faad-c2'],
    media: ['cable', 'proprietary-rf'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        medium: 'cable',
        note: "CRS records FAAD C2 as the M-LIDS C2 and states 'The LIDS and M-SHORAD systems use FAADC2'; every LIDS sensor is correlated through it.",
        source: 'CRS R48477, 31 Mar 2025; SRC LIDS Family of Systems brochure',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'fc-uplink',
        confidence: 'probable',
        medium: 'proprietary-rf',
        note: 'XBAEU is the only radar CRS records on the Increment 2.1 Stryker, which also carries Coyote, so it must supply the guidance track. No source states the uplink explicitly, unlike the documented KuMRFS-Coyote case.',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'cue',
        confidence: 'probable',
        medium: 'cable',
        note: "Same Increment 2.1 vehicle: the RIwP turret with the 30 mm is cued off the vehicle's only radar.",
      },
      {
        withSpecId: 'lib-cuaews',
        role: 'cue',
        confidence: 'probable',
        medium: 'cable',
        note: 'CRS lists SRC CUAEWS on the same single-Stryker build, so radar track and EW effect are on one platform under one FAAD C2 picture.',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'track-data',
        confidence: 'probable',
        note: 'RTX states KuRFS and the scaled Ku720-2 XBAEU work together to deliver the 360 deg picture, which implies a distributed sensing architecture rather than two independent radars.',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason:
          'No published XBAEU-Lattice integration. The documented Increment 2.1 C2 path is FAAD C2.',
      },
    ],
  },
  // Counter-small Unmanned Aircraft Electronic Warfare System, Direction Finding element (CUAEWS DF). SRC, LIDS Family of Systems brochure (marked Approved for Public Release), CUAEWS DF section (no range published); RangeBoard passive-RF family band - basis only
  {
    specId: 'lib-cuaews-df',
    program: 'Army LIDS family (FS-LIDS / M-LIDS) EW element - find-and-fix half',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        medium: 'cable',
        note: "The DF 'automatically de-clutters EW information before sending to command and control system', and in LIDS all sensors are correlated through FAAD C2.",
        source:
          'SRC LIDS Family of Systems brochure, CUAEWS DF TRACK sequence and capability description',
      },
      {
        withSpecId: 'lib-cuaews',
        role: 'cue',
        confidence: 'documented',
        medium: 'cable',
        note: "Two halves of one SRC assembly: the DF finds, fixes and classifies, then 'a man in the loop activates the defeat technique'. The system automatically resumes passive RF search on cease fire.",
        source: 'SRC LIDS Family of Systems brochure, CUAEWS DF FIND/ENGAGE/ASSESS sequence',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'alert',
        confidence: 'probable',
        medium: 'cable',
        note: 'The declutted EW picture goes to the same FAAD C2 that authorises Coyote, so the DF contributes warning rather than a fire-control track. It cannot provide a Coyote guidance uplink: it is passive and produces bearings, not range.',
      },
      {
        withSpecId: 'lib-kumrfs-m',
        role: 'track-data',
        confidence: 'probable',
        medium: 'cable',
        note: 'Passive DF bearing and radar track are the two halves of the LIDS detect picture on the two-vehicle M-LIDS section, fused at FAAD C2 rather than sensor to sensor.',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason: 'No published CUAEWS-Lattice integration. The documented LIDS C2 path is FAAD C2.',
      },
      {
        withSpecId: 'lib-tpq53',
        reason:
          'LIDS pairs CUAEWS with the AN/TPQ-50 MMR, not the AN/TPQ-53; no TPQ-53 pairing is published. Mirrors the denial the EW-domain agent authored on the jammer half.',
      },
    ],
  },
  // CACI CM262 four-sensor gyro-stabilised ground imaging system. CACI, 'CM262 ground system - Multi-mission ISR and C-sUAS' datasheet (PDF), linked from https://www.caci.com/eo-ir-imaging-systems (no DRI table published)
  {
    specId: 'lib-cm262',
    program: 'USMC L-MADIS sensor vehicle',
    protocols: [],
    media: ['cable', 'operator-manual'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-rps42',
        role: 'track-data',
        confidence: 'documented',
        medium: 'cable',
        note: 'CRS names the RPS-42 radar and the CACI AVT CM262 together as the L-MADIS detection pair: the radar cues, the gimbal identifies.',
        source: 'CRS R48477, 31 Mar 2025',
      },
      {
        withSpecId: 'lib-modi',
        role: 'cue',
        confidence: 'probable',
        medium: 'operator-manual',
        note: 'On the L-MADIS pair the radar and CM262 find and identify; the operator then engages with Modi 2 on the second ULTV. The handover is an operator action, not a data interface.',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'probable',
        medium: 'cable',
        note: 'The Joint C-sUAS Office required its interim selections including L-MADIS to integrate with FAAD C2. The requirement was on the system, not specifically on this gimbal.',
      },
      {
        withSpecId: 'lib-cac2s',
        role: 'track-data',
        confidence: 'inferred',
        medium: 'cable',
        note: 'The L-MADIS section fights inside the Marine Air Command and Control System that CAC2S serves. No source names a CM262-to-CAC2S interface.',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason:
          "No published CM262-Lattice integration. Do not infer one from Lattice's general third-party sensor claims.",
      },
    ],
  },
  // Leonardo DRS Stabilized Sight Sensor (S3). SRC, LIDS Family of Systems brochure (marked Approved for Public Release), MOBILE SOLUTIONS (Electronic Warfare and Kinetic vehicles)
  {
    specId: 'lib-drs-s3',
    program: 'Moog RIwP turret sight (M-LIDS kinetic vehicle; M-SHORAD Increment 1)',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-xm914',
        role: 'fc-uplink',
        confidence: 'documented',
        medium: 'cable',
        note: "The S3 is the RIwP's integrated sight for the XM914E1 30 mm and coaxial M240 on the same turret, with a built-in auto-tracker that holds the track through the engagement.",
        source: 'SRC LIDS Family of Systems brochure, Turreted Systems section',
      },
      {
        withSpecId: 'lib-coyote',
        role: 'cue',
        confidence: 'probable',
        medium: 'cable',
        note: 'The same RIwP turret hosts the two-round Coyote Block 2+ launcher, so the sight supports visual identification before release. The Coyote guidance track itself comes from the KuMRFS family radar, not from the sight.',
      },
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'probable',
        medium: 'cable',
        note: 'M-LIDS correlates all sensors and effectors through FAAD C2; the brochure lists FAAD C2 on both vehicles.',
      },
      {
        withSpecId: 'lib-kumrfs-m',
        role: 'track-data',
        confidence: 'probable',
        medium: 'cable',
        note: "Masted radar and turret sight are the two halves of the kinetic vehicle's track picture: radar acquires, sight identifies and holds.",
      },
    ],
    denied: [
      {
        withSpecId: 'lib-lattice',
        reason: 'No published S3-Lattice integration. The documented M-LIDS C2 path is FAAD C2.',
      },
    ],
  },
  // Long Range Sentry Tower with Fire Control (Anduril Sentry family). Anduril Industries, Sentry product page
  {
    specId: 'lib-sentry-lr-fc',
    program: 'Anduril Sentry family; USMC I-CsUAS; Kuwait FMS 2026',
    protocols: ['lattice'],
    media: ['mesh-radio', 'cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'documented',
        medium: 'mesh-radio',
        note: "Sentry towers are Lattice-native: 'Lattice fuses real-time data from Anduril's Sentry Towers in addition to third-party data sources to create comprehensive actionable intelligence for operators.'",
        source: 'Anduril Sentry product page and XRST launch announcement, accessed 2026-08-24',
      },
      {
        withSpecId: 'lib-pulsar',
        role: 'track-data',
        confidence: 'probable',
        medium: 'mesh-radio',
        note: 'Pulsar RF and Sentry tower feeds are fused in the same Lattice picture in fielded kits; the pairing runs through Lattice, not sensor to sensor.',
      },
      {
        withSpecId: 'lib-wisp',
        role: 'track-data',
        confidence: 'probable',
        medium: 'mesh-radio',
        note: 'WISP infrared and tower radar are co-fielded Anduril sensors fused by Lattice. Same routing caveat.',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No published Sentry-FAAD C2 interface. The documented C2 path for every Anduril sensor is Lattice.',
      },
      {
        withSpecId: 'lib-anvil',
        reason:
          "Not a denial of capability: Anvil is documented as receiving targeting from Sentry towers, but only THROUGH Lattice. lib-anvil already carries requiredC2 ['lib-lattice'], so a direct sensor-to-effector pair would misrepresent the architecture.",
      },
      { withSpecId: 'lib-medusa', reason: 'No published Sentry-MEDUSA integration.' },
    ],
  },
  // FIM-92 Stinger surface-to-air missile. Raytheon (General Dynamics) FIM-92 Stinger — Directory of U.S. Military Rockets and Missiles
  {
    specId: 'lib-stinger',
    program: 'M-SHORAD Inc 1 (Sgt. Stout); USMC MADIS Mk1; FS-LIDS/MADIS SHORAD tier',
    protocols: ['faad-c2'],
    media: ['cable', 'operator-manual'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'documented',
        note: 'FAAD C2 is the Army/USMC SHORAD C2 of record that authorises Stinger engagements on M-SHORAD and MADIS.',
        source: 'CRS R48477, Mar 2025; NG FAAD/C-RAM C2 data sheet',
      },
      {
        withSpecId: 'lib-rps42',
        role: 'cue',
        confidence: 'documented',
        note: 'The MADIS Mk2 RPS-42-family radar cues the Mk1 turret that carries the four-round Stinger ATAL pod.',
        source: 'Army Recognition MADIS page, 2025; CRS R48477',
      },
      {
        withSpecId: 'lib-xm914',
        role: 'c2-interop',
        confidence: 'documented',
        note: 'Co-mounted with the XM914E1 30 mm on the MADIS Mk1 RS6 RWS and on the M-SHORAD RIwP turret for layered defeat.',
        source: 'Seapower MADIS RWS; CRS R48477, Mar 2025',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'engage-order',
        confidence: 'inferred',
        note: 'Lattice is expected to command fielded SHORAD effectors; no Stinger interface is published.',
        source: 'Breaking Defense, Oct 2025; DefenseScoop, Mar 2026',
      },
    ],
    guidance: 'self',
  },
  // Electronic Advanced Ground Launcher System (EAGLS). APKWS: The Cheap Rocket That Kills Drones
  {
    specId: 'lib-eagls',
    program: 'US Army RAA C-UAS buy; NAVAIR EAGLS; CENTCOM base defence',
    protocols: [],
    media: ['cable', 'proprietary-rf'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'engage-order',
        confidence: 'inferred',
        note: 'Reporting states EAGLS shares tracks and engagement data with existing air-defence networks; CENTCOM C-UAS effectors operate under the FAAD C2 architecture, but no FAAD C2 integration kit is named for EAGLS.',
        source: 'Army Recognition, 22 Jan 2026',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'engage-order',
        confidence: 'inferred',
        note: 'Anduril Lattice was selected to replace FAAD C2 as Army C-UAS fire control, which would place fielded launchers such as EAGLS under it.',
        source: 'Breaking Defense Oct 2025; DefenseScoop Mar 2026',
      },
      {
        withSpecId: 'lib-kurfs',
        role: 'c2-interop',
        confidence: 'inferred',
        note: 'EAGLS and the LIDS KuRFS/Coyote layer are both deployed for CENTCOM base defence, so co-siting and picture sharing is likely; no source establishes a specific pairing.',
        source: 'CRS R48477 Mar 2025; Army Recognition Jan 2026',
      },
    ],
    guidance: 'self',
  },
  // Rheinmetall Skyranger 30. Skyranger — Mobile air defence (Rheinmetall product page)
  {
    specId: 'lib-skyranger30',
    program:
      'Rheinmetall Skyranger 30; German Boxer Skyranger; Austrian, Danish, Hungarian and Dutch programmes',
    protocols: [],
    media: ['cable', 'mesh-radio'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-stinger',
        role: 'c2-interop',
        confidence: 'probable',
        medium: 'cable',
        note: 'Stinger is a turret option on Skyranger 30, not a universal fit.',
        source: 'Skyranger 30, Wikipedia and The Defense Post, Aug 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No published FAAD C2 integration. Skyranger operates on national and NATO ground-based air-defence C2, not the US Army FAAD C2 network.',
      },
      {
        withSpecId: 'lib-kurfs',
        reason:
          'Skyranger carries its own AESA search and tracking fit; no source pairs it with the US Ku-band KuRFS fire-control radar.',
      },
    ],
    guidance: 'self',
  },
  // Fortem DroneHunter F700. DroneHunter Counter Unmanned Aerial System (C-UAS), US
  {
    specId: 'lib-dronehunter',
    program: 'Replicator 2 (JIATF-401); DoD and federal airspace security',
    protocols: [],
    media: ['proprietary-rf', 'cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-picogrid',
        role: 'cue',
        confidence: 'inferred',
        medium: 'cable',
        note: 'Fortem publishes an open C2 API and SkyDome Manager for third-party track ingest; no source establishes a specific Picogrid pairing.',
        source: 'Fortem DroneHunter F700 product page, 2026',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-faadc2',
        reason:
          'No published FAAD C2 integration kit. DroneHunter is commanded by Fortem SkyDome Manager and cues itself from its own TrueView radar.',
      },
    ],
    guidance: 'self',
  },
  // AN/MPQ-64A4 Sentinel A4 Air and Missile Defense Radar. Sentinel A4 — The Army's Premier Battlefield Radar for the Next 40 Years (product card)
  {
    specId: 'lib-sentinela4',
    program: 'US Army Sentinel A4 program of record (SHORAD/AMD acquisition radar)',
    protocols: ['faad-c2'],
    media: ['cable', 'mesh-radio'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'Lockheed Martin lists a FAAD C2 interface for SHORAD forces as a Sentinel A4 data link interface.',
        source: 'LM Sentinel A4 product card, 2024',
      },
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: "Lattice is replacing FAAD C2 as Army C-UAS fire control, so the Army's new SHORAD acquisition radar is in scope; no Sentinel-specific integration is published.",
        source: 'Breaking Defense Oct 2025; DefenseScoop Mar 2026 (as cited in existing library)',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'X-band acquisition radar; Coyote Block 2 fire control needs the Ku-band KuRFS guidance uplink, which Sentinel A4 does not provide.',
      },
    ],
  },
  // AN/TPS-80 Ground/Air Task-Oriented Radar (G/ATOR). RangeBoard SENSOR_ROLE_DEFAULT_RANGE_M (src/model/types.ts) — basis only
  {
    specId: 'lib-gator',
    program: 'USMC AN/TPS-80 program of record; GBAD MRIC sensor; feeds CAC2S',
    protocols: [],
    media: ['cable', 'fiber'],
    standalone: true,
    pairs: [],
    denied: [],
  },
  // Giraffe 1X 3D surveillance radar. Saab Giraffe 1X product page
  {
    specId: 'lib-giraffe1x',
    program:
      'US Army security-cooperation C-UAS radars for Estonia, Latvia and Lithuania; Saab Giraffe family',
    protocols: ['faad-c2'],
    media: ['cable', 'mesh-radio'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'Northrop names Giraffe 1X in the FAAD C2 supported-sensor list.',
        source: 'Northrop Grumman FAAD C2 infographic NG23-0503-0384, 2023',
      },
    ],
    denied: [],
  },
  // SPEXER 2000 3D (MkII / MkIII) surveillance radar. HENSOLDT SPEXER 2000 3D Radar — C-UAV and Critical Asset Protection datasheet, issue 2
  {
    specId: 'lib-spexer2000',
    program:
      'HENSOLDT SPEXER family; C-UAV and critical asset protection; in service with 8 nations',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [],
    denied: [],
  },
  // EchoGuard 4D surveillance radar. Echodyne EchoGuard 4D Surveillance Radar technical specification sheet (rev 6JL)
  {
    specId: 'lib-echoguard',
    program: 'Echodyne commercial short-range C-UAS and perimeter radar',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-rf360',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'Dedrone lists Echodyne as a technology partner and fuses Echodyne radar with Dedrone RF in DedroneTracker.AI; the Echodyne model is not named.',
        source: 'dedrone.com technology partners (as cited for lib-echoshield)',
      },
      {
        withSpecId: 'lib-rfone',
        role: 'c2-interop',
        confidence: 'probable',
        note: 'DroneShield DroneSentry-C2 integrates Echodyne radars alongside DroneShield RF sensors; the Echodyne model is not named.',
        source: 'UASweekly, Mar 2025 (as cited for lib-echoshield)',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'K-band short-range surveillance panel with about 1 km on a Group 1 quadcopter; it provides neither the Ku-band fire-control uplink Coyote needs nor the range to support it.',
      },
    ],
  },
  // Spyglass short-range surveillance radar. Numerica announces Spyglass, a new 3D radar for C-UAS and short-range defense missions
  {
    specId: 'lib-spyglass',
    program: 'Anduril (ex-Numerica) Spyglass; JCO C-sUAS-as-a-Service demonstration 2022',
    protocols: ['lattice'],
    media: ['cable', 'mesh-radio'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-lattice',
        role: 'track-data',
        confidence: 'probable',
        note: 'Anduril states Spyglass is being integrated into Lattice; the integration is stated as intent, not completion.',
        source: 'Anduril / Military Embedded Systems, Jan 2025',
      },
    ],
    denied: [],
  },
  // Blighter A422 air security radar (A400 series). A400 series air security radars specification (ATRI, JSC — Blighter distributor, reproducing the Blighter A400 datasheet)
  {
    specId: 'lib-a422',
    program: 'Blighter A400 series; UK-supplied C-UAS radars to Ukraine 2022; AUDS radar',
    protocols: [],
    media: ['cable'],
    standalone: true,
    pairs: [],
    denied: [],
  },
  // Ground Master 200 Multi-Mission Compact (GM200 MM/C). RangeBoard SENSOR_ROLE_DEFAULT_RANGE_M (src/model/types.ts) — basis only
  {
    specId: 'lib-gm200mmc',
    program: 'NATO multi-mission radar (Netherlands, Denmark, Lithuania)',
    protocols: [],
    media: ['cable', 'fiber'],
    standalone: true,
    pairs: [],
    denied: [],
  },
  // CORIAN (Counter-Remote Control Model Aircraft Integrated Air Defense Network). RangeBoard SENSOR_ROLE_DEFAULT_RANGE_M + peer passive-RF datasheets
  {
    specId: 'lib-corian',
    program:
      'JCO interim C-sUAS fixed/semi-fixed (Navy-sponsored); CACI SkyTracker suite; JIATF-401 Domestic Shield',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        medium: 'cable',
        note: 'Northrop names CORIAN in the FAAD C2 supported-technology list.',
        source: 'Northrop Grumman FAAD C2 infographic NG23-0503-0384, 2023',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'TDOA geolocation of an RF emitter is a position estimate on the controller and airframe, not a fire-control track, and CORIAN carries no Ku-band guidance uplink.',
      },
    ],
  },
  // Wingman 103 wearable drone detector. MyDefence, 'Wingman 103 & 105 RF Detectors' datasheet
  {
    specId: 'lib-wingman',
    program:
      'MyDefence Soldier-Kit; US Army wearable C-UAS order (Jul 2025); Ukraine and NATO national deliveries',
    protocols: ['cot-tak'],
    media: ['mesh-radio', 'operator-manual'],
    standalone: true,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'A dismounted RF detection reaches the jammer operator verbally, not as a machine link.',
      },
      {
        withSpecId: 'lib-coyote',
        reason:
          'A wearable amplitude-comparison DF alert gives a 30 deg bearing sector and no range; it cannot generate an interceptor fire-control track.',
      },
    ],
  },
  // RfPatrol Mk2 body-worn drone detection device. Defence Connect, 'DroneShield releases Mk II drone detection device'; Army Recognition, 'DroneShield releases handheld RfPatrol Mk II drone detector'
  {
    specId: 'lib-rfpatrol',
    program: 'DroneShield dismounted line; Immediate Response Kit; DroneSentry-C2 ecosystem',
    protocols: [],
    media: ['proprietary-rf', 'operator-manual'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-rfone',
        role: 'c2-interop',
        confidence: 'probable',
        medium: 'proprietary-rf',
        note: "DroneShield's Aug 2024 RF sensor release updated RfPatrol Mk2 and RfOne Mk2 together and shipped a shared expanded API plus protocol-buffer packages for third-party integration; a common DroneSentry-C2 picture is near-certain but not stated in those words.",
        source: "cuashub, 'DroneShield Releases Update for RF Sensors', Aug 2024",
      },
    ],
    denied: [
      {
        withSpecId: 'lib-dronebuster',
        reason:
          'A dismounted RF detection reaches the jammer operator verbally, not as a machine link.',
      },
      {
        withSpecId: 'lib-coyote',
        reason:
          'A body-worn detector produces an alert and a coarse bearing, not a fire-control track, and carries no interceptor uplink.',
      },
    ],
  },
  // R&S ARDRONIS (Locate configuration). Rohde & Schwarz, 'ARDRONIS Locate Compact' solution page
  {
    specId: 'lib-ardronis',
    program:
      'R&S ARDRONIS family; GUARDION (ESG/Diehl) for Bundeswehr field-camp protection; NATO TIE 2024 and 2026',
    protocols: ['sapient'],
    media: ['cable'],
    standalone: true,
    pairs: [],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'ARDRONIS produces lines of bearing and classified emitter identity, not a 3D fire-control track, and carries no Ku-band interceptor uplink.',
      },
    ],
  },
  // Titan C-UAS. BlueHalo, 'TITAN C-UAS Counter-Unmanned Aerial System' brochure (Aug 2023 revision)
  {
    specId: 'lib-titan',
    program: 'US Army Titan C-UAS kits; AeroVironment US Army FMS IDIQ (Dec 2025)',
    protocols: ['faad-c2'],
    media: ['cable'],
    standalone: true,
    pairs: [
      {
        withSpecId: 'lib-faadc2',
        role: 'track-data',
        confidence: 'documented',
        note: 'Northrop names Titan EW in the FAAD C2 supported-technology list.',
        source: 'Northrop Grumman FAAD C2 infographic NG23-0503-0384, 2023',
      },
    ],
    denied: [
      {
        withSpecId: 'lib-coyote',
        reason:
          'Titan detects and DFs an RF emitter and defeats it electronically; it produces no 3D fire-control track and no Ku-band interceptor uplink.',
      },
    ],
  },
];
