(function (PS) {
  "use strict";
  var C = PS.catalog = {};

  // v1 GROUPS and CATALOG, unchanged; rf added per contract 3
  C.GROUPS = {1:{w:"under 20 lb",alt:"under 1,200 ft AGL",spd:"under 100 kt"},2:{w:"21 to 55 lb",alt:"under 3,500 ft AGL",spd:"under 250 kt"},3:{w:"56 to 1,320 lb",alt:"under 18,000 ft MSL",spd:"under 250 kt"}};
  C.ARCHETYPES = [
 {id:"g1-quad-isr",group:1,name:"Quadrotor ISR",airframe:"multirotor",role:"isr",cruise:12,vmax:21,alt:[30,400],endurance:[20,55],prop:"electric",link:"RF 2.4/5.8 GHz + GNSS, return home on loss",sig:"Sub-0.05 m² RCS; the video downlink is the main cue",behaviors:["hover and stare","ingress below 120 m","waypoint orbit","payload drop from hover"],src:"https://drdrone.ca/pages/dji-mavic-3-technical-specifications"},
 {id:"g1-fpv-rf",group:1,name:"FPV attack, RF manual",airframe:"multirotor",role:"one-way-attack",cruise:25,vmax:42,alt:[2,100],endurance:[3,15],prop:"electric",link:"900 MHz or 2.4 GHz control, 5.8 GHz video, manual pilot",sig:"Smallest RCS in the catalog; analog video is the primary RF cue",behaviors:["nap of the earth ingress","terminal dive","route ambush loiter","machine vision terminal lock"],src:"https://euromaidanpress.com/2024/01/25/how-fpv-drones-became-ukraine-top-weapon/"},
 {id:"g1-fpv-fiber",group:1,name:"FPV attack, fiber optic",airframe:"multirotor",role:"one-way-attack",cruise:15,vmax:30,alt:[2,60],endurance:[5,20],prop:"electric",link:"Fiber tether 10 to 20 km, no RF emission",sig:"Zero RF signature; RF detection and jamming do not apply",behaviors:["RF silent ingress","GPS denied manual flight","terrain and culvert follow","land, wait, relaunch"],src:"https://news.liga.net/en/amp/politics/news/defense-ministry-approves-new-ukrainian-fiber-optic-drone-photos-and-specifications"},
 {id:"g1-swarm-quad",group:1,name:"Swarm element quadrotor",airframe:"multirotor",role:"swarm-element",cruise:14,vmax:25,alt:[30,300],endurance:[10,30],prop:"electric",link:"Mesh RF + GNSS waypoint, onboard autonomy",sig:"Each element near invisible; the aggregate saturates trackers",behaviors:["mass launch","formation ingress then split","multi axis time on target","retask on attrition"],src:"https://defensescoop.com/?p=77283"},
 {id:"g2-heavy-multirotor",group:2,name:"Heavy lift multirotor bomber",airframe:"multirotor",role:"strike",cruise:12,vmax:22,alt:[50,400],endurance:[20,40],prop:"electric",link:"RF + GNSS, often relayed over LTE or SATCOM",sig:"Largest rotorcraft RCS, loud low frequency acoustic",behaviors:["night approach 100 to 400 m","hover drop","mothership release of FPVs","slow loaded transit"],src:"https://rubryka.com/en/2026/01/30/dron-bomber-vampire/"},
 {id:"g2-vtol-isr",group:2,name:"VTOL fixed wing ISR",airframe:"vtol-hybrid",role:"isr",cruise:17,vmax:25,alt:[300,1800],endurance:[120,180],prop:"electric",link:"RF datalink + GNSS",sig:"Small RCS, distinct rotor acoustic in transition",behaviors:["vertical launch from a clearing","persistent racetrack","standoff 20 to 50 km"],src:"https://www.janes.com/"},
 {id:"g2-fw-isr",group:2,name:"Fixed wing ISR, catapult",airframe:"fixed-wing",role:"isr",cruise:25,vmax:42,alt:[500,2000],endurance:[240,960],prop:"piston",link:"RF datalink to 120 km + GNSS/INS autonomous",sig:"Small RCS; piston engine gives acoustic and IR cue",behaviors:["racetrack orbit 1 to 2 km AGL","artillery spotting","ISR plus relay pair","GPS denied dead reckoning"],src:"https://www.globalsecurity.org/military/world/russia/orlan-10-specs.htm"},
 {id:"g2-lm-xwing",group:2,name:"Loitering munition, X wing",airframe:"fixed-wing",role:"loitering-munition",cruise:27,vmax:80,alt:[100,3000],endurance:[30,60],prop:"electric",link:"RF video link, man in the loop terminal + GNSS/INS",sig:"Low RCS, quiet loiter; terminal dive to 80 m/s compresses the window",behaviors:["catapult launch","loiter 30 to 40 min","operator lock then steep dive","cued by separate ISR"],src:"https://www.globalsecurity.org/military/world/russia/lancet-specs.htm"},
 {id:"g3-delta-owa",group:3,name:"Delta wing one way attack, piston",airframe:"delta-wing",role:"one-way-attack",cruise:46,vmax:52,alt:[50,4000],endurance:[300,840],prop:"piston",link:"GNSS/INS autonomous, no link",sig:"Low RCS for size; loud piston acoustic; RF silent unless modem fitted",behaviors:["terrain following ingress 50 to 200 m","dogleg route","climb then steep terminal dive","salvo, multi axis arrival"],src:"https://missilethreat.csis.org/missile/shahed-131-and-136/"},
 {id:"g3-foam-decoy",group:3,name:"Foam delta wing decoy",airframe:"delta-wing",role:"decoy",cruise:35,vmax:44,alt:[100,3000],endurance:[120,240],prop:"piston",link:"GNSS waypoint + mesh modem relay",sig:"Lowest RCS of the delta wings yet shaped to read as an attack track",behaviors:["lead the strike to saturate defenses","mesh relay","decoy formation around real OWA"],src:"https://en.wikipedia.org/wiki/Gerbera_(drone)"},
 {id:"g3-jet-owa",group:3,name:"Turbine one way attack",airframe:"delta-wing",role:"one-way-attack",cruise:95,vmax:125,alt:[100,9000],endurance:[120,300],prop:"turbine",link:"GNSS/INS autonomous, optional terminal seeker",sig:"Highest IR signature; closing speed halves the engagement window",behaviors:["high speed dash","high cruise then dive","low terminal run","mixed salvo with piston OWA and decoys"],src:"https://missilethreat.csis.org/missile/shahed-238/"},
 {id:"g3-vtol-hybrid",group:3,name:"VTOL hybrid fixed wing, ISR or strike",airframe:"vtol-hybrid",role:"isr",cruise:30,vmax:40,alt:[300,3000],endurance:[120,300],prop:"hybrid",link:"RF + GNSS/INS, autonomous on link loss",sig:"Moderate RCS at 3 to 5 m span; rotor acoustic in transition",behaviors:["vertical launch from a confined site","long range autonomous ingress","vertical terminal descent"],src:"https://www.muginuav.com/mugin-5-pro-5000mm-vtol-uav-platform-8-motor-mounts/"},
 {id:"g3-target-piston",group:3,name:"Piston target drone, surrogate",airframe:"fixed-wing",role:"surrogate",cruise:33,vmax:65,alt:[100,4900],endurance:[60,480],prop:"piston",link:"RF command link + GPS autopilot, scripted profiles",sig:"Surrogate for Group 2 and 3 fixed wing; RCS and IR can be augmented",behaviors:["catapult launch","straight and level presentation","low ingress 100 to 300 m","weave","augmented RCS or towed target"],src:"https://designation-systems.net/dusrm/m-170.html"}
  ];
  var NO_RF = { "g1-fpv-fiber": true, "g3-delta-owa": true, "g3-jet-owa": true };
  C.ARCHETYPES.forEach(function (a) { a.rf = !NO_RF[a.id]; });

  C.SYS_KINDS = [["radar", "3D radar"], ["rf", "RF detector"], ["eoir", "EO/IR"], ["acoustic", "Acoustic"], ["ew", "RF effector"],
    ["kinetic", "Kinetic effector"], ["de", "Directed energy"], ["c2", "C2 node"], ["tspi", "TSPI station"]];
  C.SENSOR_KINDS = ["radar", "rf", "eoir", "acoustic"];
  C.EFFECTOR_KINDS = ["ew", "kinetic", "de"];
  // confirm and tte are planning defaults, not measured values
  C.SYS_DEFAULTS = {
    radar: { range: 4000, fov: 360, prefix: "RDR-", confirm: 3 },
    rf: { range: 3000, fov: 360, prefix: "RF-", confirm: 2 },
    eoir: { range: 2500, fov: 30, prefix: "EO-", confirm: 4 },
    acoustic: { range: 800, fov: 360, prefix: "AC-", confirm: 3 },
    ew: { range: 1500, fov: 360, prefix: "EW-", tte: 10 },
    kinetic: { range: 3000, fov: 360, prefix: "KIN-", tte: 8 },
    de: { range: 1000, fov: 360, prefix: "DE-", tte: 6 },
    c2: { range: 0, fov: 0, prefix: "C2-" },
    tspi: { range: 0, fov: 0, prefix: "TM-" }
  };
  C.ID_DWELL = 5;
  C.COAST_S = 10;
  C.RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
  C.VOL_KINDS = [["asset", "Defended asset"], ["wez", "Engagement zone"], ["nfz", "No fly volume"], ["ref", "Reference pattern"]];
  C.VOL_DEFAULTS = { asset: { zmax: 0, prefix: "DA" }, wez: { zmax: 1200, prefix: "WEZ" }, nfz: { zmax: 150, prefix: "NFZ" }, ref: { zmax: 0, prefix: "REF" } };
  C.EV_TYPES = { detect: "D", track: "T", id: "I", engage: "E", split: "S", merge: "M", loiter: "L", terminal: "X", checkpoint: "C" };
  C.EV_NAMES = { detect: "Detect", track: "Track init", id: "Identify", engage: "Engage", split: "Split", merge: "Merge", loiter: "Loiter", terminal: "Terminal", checkpoint: "Checkpoint" };
  C.LADDER_STEPS = ["detect", "track", "id", "engage", "effect"];
  C.IDENTITIES = ["hostile", "suspect", "unknown", "pending", "neutral", "friend"];
  C.CLASSES = ["Counter-UAS", "Multi-aircraft", "One-way attack", "Surrogate", "Custom"];

  C.arch = function (id) {
    for (var i = 0; i < C.ARCHETYPES.length; i++) if (C.ARCHETYPES[i].id === id) return C.ARCHETYPES[i];
    return C.ARCHETYPES[0];
  };

  C.cruiseHeight = function (arch) {
    var a = arch || C.ARCHETYPES[0];
    return Math.round((a.alt[0] + a.alt[1]) / 2);
  };

  function sysSub(kind) {
    if (C.SENSOR_KINDS.indexOf(kind) >= 0) return "Sensor";
    if (C.EFFECTOR_KINDS.indexOf(kind) >= 0) return "Effector";
    return kind === "tspi" ? "Station" : "Node";
  }

  // palette rows in group order; q matches label and sub, case-insensitive
  C.search = function (q) {
    var rows = [];
    C.ARCHETYPES.forEach(function (a) {
      rows.push({ group: "aircraft", id: a.id, label: a.name, sub: "Group " + a.group + ", " + a.airframe + ", " + a.role });
    });
    C.SYS_KINDS.forEach(function (k) { rows.push({ group: "systems", id: k[0], label: k[1], sub: sysSub(k[0]) }); });
    C.VOL_KINDS.forEach(function (k) { rows.push({ group: "volumes", id: k[0], label: k[1], sub: "Volume" }); });
    Object.keys(C.EV_NAMES).forEach(function (k) { rows.push({ group: "events", id: k, label: C.EV_NAMES[k], sub: "Event" }); });
    rows.push({ group: "reference", id: "plane", label: "Height plane", sub: "Reference line" });
    var s = String(q == null ? "" : q).trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(function (r) { return (r.label + " " + r.sub).toLowerCase().indexOf(s) >= 0; });
  };
})(globalThis.PS);
