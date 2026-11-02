import json
from gen import *

CEIL=('400 ft AGL ceiling (Part 107)',121.9)
SAFETY=('Safety: every path stays inside the UAS Fly Area; no path points at the camera site or at GCS-1. The One-way attack aim point sits 60 m short of the cameras. '
        'Site datum: the profile origin is the centre of the UAS Fly Area file (lat 35.289972, lon -79.385599, WGS84). Ground elevation 150 m is a planning value; survey it.')
CLOCK='Before the first run: synchronize the PC, camera and telemetry clocks, record the offset with a visible time-marked event, and keep the correction (plan section 7, step 3).'
def truthKeys(ns): return [n['key'] for n in ns if n['kind']=='tspi']
def camLine(sensors):
    """'CAM-1 and CAM-2: 80 deg at 1x, tilt 10 deg up. CAM-3: ...' for the card notes."""
    return ' '.join(f"{s['id']}: {s['fovDeg']:g} deg at {s['zoom']}, tilt {s['tiltDeg']:g} deg up, upper limit {s['elMaxDeg']:g} deg." for s in sensors)
def lossLine(sensors,z=40):
    """'CAM-4 at 5x loses a target at 40 m AGL inside about 168 m, CAM-3 ...' from each camera's upper limit."""
    parts=[f"{s['id']} at {s['zoom']} inside about {lossAt(s['elMaxDeg'],z):.0f} m" for s in sensors]
    return f"At {z:g} m AGL the elevation angle passes each camera's upper limit: "+', '.join(parts)+f". Sensor {SENSOR[ASPECT][0]} x {SENSOR[ASPECT][1]} assumed; a 16:9 sensor narrows the vertical FOV and moves every limit out (confirm the model)."

def firstWindow(sensor,w):
    ws=windows(sensor,w); return ws[0][0] if ws else None

# ---------------------------------------------------------------- 1. Range Ladder
def rangeLadder():
    sensors=cams_baseline(); ns=nodes()
    bands=[(400,470),(300,400),(200,300),(100,200),(50,100)]
    holds=[450,350,250,150,75]
    path=[wp(LAUNCH,0,120),wp(LAUNCH,40)]
    for d in holds: path.append(wp(P(S_CAM-d),40,30))
    T1=threat('T1','g1-quad-isr',path,5)
    w=timed(path,5)
    areas=rangeAreas()+[da()]
    for i,(d1,d2) in enumerate(bands):
        areas.append(area(f'REF-{i+1}','ref',f'Band {d1} to {d2} m',clipBand(FLY,S_CAM-d2,S_CAM-d1)))
    evs=[]; n=1
    evs.append(ev(f'e{n}',0,'checkpoint','Recording on; target-absent interval (120 s)',T1['key'],None)); n+=1
    for i,d in enumerate(holds):
        t=w[2+i][3]
        evs.append(ev(f'e{n}',t,'checkpoint',f'Band {d} m: hover 30 s',T1['key'],None)); n+=1
    f4=firstAt(sensors[3],w,PX['cue'])
    evs.append(ev(f'e{n}',f4,'detect',f"First possible cue expected (CAM-4, 5x, {PX['cue']} px) at about {groundAt(sensors[3],w,f4):.0f} m",T1['key'],sensors[3]['key'])); n+=1
    evs.append(idEvent(f'e{n}',sensors,w,T1['key'],'Mavic 3',w[-1][3])); n+=1
    tH=[w[2+i][3]+15 for i in range(5)]
    cards=[
      card('c1','Laydown','plan',None,[],'Range ladder: one Mavic 3 hovers 30 s at five distance bands on the fly-area axis, 40 m AGL, 5 m/s between bands. Four cameras at the SE end look NW (bearing 322).',
           camLine(sensors)+f" Each camera is yawed to the axis {AIM_S} m before the camera line; survey and record azimuth and tilt. Reach rings are planning values from the pixel-footprint estimate (Appendix A.1) at {PX['cue']} px on a {W_MAVIC:g} m target, not measured ranges. The ladder measures them."),
      card('c2','Band 450 m','plan',tH[0],[T1['key']],'Band 400 to 470 m. Only CAM-4 at 5x is expected to hold the target here. The 80 deg cameras read it as a non-detection in this bin.',
           'Appendix C.2: report detection probability per fixed distance bin. A non-detection inside the FOV is an optical limit; outside the FOV it is FOV-limited and must be flagged.'),
      card('c3','Band 250 m','plan',tH[2],[T1['key']],'Band 200 to 300 m. CAM-3 at 2x and CAM-4 at 5x hold the target; the 80 deg cameras reach their planning limit here.',
           'The middle band decides the 80 deg cameras. Expect the first possible cue here and the confirmed detection one band closer.'),
      card('c4','FOV limit at the near bands','elevation',tH[3],[T1['key']],'Side view along the path at the 150 m band. '+lossLine(sensors)+' From there inward those trials are FOV-limited, not optical limits; the 80 deg cameras hold the target to the 75 m band.',
           'Plan section 6: label trials FOV-limited when the aircraft enters the image after it is already large enough for detection. The near bands belong to the 80 deg cameras.'),
      card('c5','The ladder, 3D','3d',tH[1],[T1['key']],'The five hovers along the axis, with the four camera sectors from the SE end.','Use this view in the brief to show the bands and the sectors together.'),
      card('c6','Approach slice','plan',w[2][3],[T1['key']],'The run from launch to the last band, at x4.','Play this slice in the brief; the timeline shows each camera window against the five hovers.',
           clip={'t0S':round(w[1][3]),'t1S':round(w[-1][4]),'rate':4,'beatsS':[]}),
    ]
    Q=q('At which distance bands does each of the four cameras detect, confirm and identify a Mavic 3 on the fly-area axis, and with what probability per bin?',
        'Response: detection outcome per bin, per camera, per run (possible, confirmed, identified, none; FOV-limited flag). Vary: distance band (5 levels), camera configuration (4). Hold: altitude 40 m AGL, speed 5 m/s, aspect head-on, 30 s per band. Record: sun, sky background, wind, visibility. Replicates: 3 runs minimum (Appendix C.2). Target-absent interval: 120 s before launch, every run.')
    notes=('Run order: ladder first (establishes the bands for the other profiles). Three replicate runs, same conditions; add a fourth if two bins disagree between runs. '
           'Hover 30 s at 450, 350, 250, 150 and 75 m from the camera line, 40 m AGL, 5 m/s between bands. '
           'Each hover gives every camera one 30 s observation interval per bin. '+CLOCK+' '+SAFETY[0] if False else '')
    notes=('Run order: ladder first; it establishes the distance bins for the other profiles. Three replicate runs under the same conditions; add a fourth if two bins disagree between runs. '
           'Hover 30 s at 450, 350, 250, 150 and 75 m from the camera line, 40 m AGL, 5 m/s between bands, head-on aspect. Each hover gives every camera one 30 s observation interval per bin. '
           'Review each camera independently (plan section 7, step 6) and mark possible, confirmed and identified per bin; compute ground and slant range from the GCS log at each event. '
           +CLOCK+' '+SAFETY)
    v=vignette('JIOP-1','Range ladder, Mavic 3 by distance band','Counter-UAS',Q,[T1],sensors,ns,areas,planes([('Test altitude 40 m AGL',40),CEIL]),evs,[],cards,
        [m('1.1.1','>=',90,'%'),m('1.1.2','>=',300,'m'),m('1.1.3','>=',300,'m'),m('2.1.3','>=',150,'m'),m('1.1.4','<=',2,'per hour')],notes,
        ['Per-bin detection table: run, camera, bin, outcome (possible, confirmed, identified, none), FOV-limited flag'],truthKeys(ns))
    return v

# ---------------------------------------------------------------- 2. One-Way Attack
def oneWayAttack():
    sensors=cams_baseline(W_TANQ); ns=nodes()
    aim=P(140)
    path=[wp(LAUNCH,0,120),wp(LAUNCH,40),wp(P(100),40),wp(aim,5,5)]
    T1=threat('T1','g1-fpv-rf',path,15)
    w=timed(path,15)
    areas=rangeAreas()+[da(),area('REF-1','ref','Aim point (simulated, no payload)',square(aim,16))]
    # the earliest camera at each pixel threshold on a 0.25 m Tanq (gen.py PX), by elevation and azimuth coverage
    cue=earliestAt(sensors,w,PX['cue']); conf=earliestAt(sensors,w,PX['confirmed']); ident=earliestAt(sensors,w,PX['identified'])
    idText=(f"Identified expected ({camName(ident[1])}, {PX['identified']} px) at about {groundAt(ident[1],w,ident[0]):.0f} m" if ident else
            f"Identified ({PX['identified']} px) not expected before the aim point in any camera")
    evs=[ev('e1',0,'checkpoint','Recording on; target-absent interval (120 s)',T1['key'],None),
         ev('e2',w[1][3],'checkpoint','Launch and climb to 40 m AGL',T1['key'],None),
         ev('e3',cue[0],'detect',f"First possible cue expected ({camName(cue[1])}, {PX['cue']} px) at about {groundAt(cue[1],w,cue[0]):.0f} m",T1['key'],cue[1]['key']),
         ev('e4',conf[0],'track',f"Confirmed detection expected ({camName(conf[1])}, {PX['confirmed']} px) at about {groundAt(conf[1],w,conf[0]):.0f} m",T1['key'],conf[1]['key']),
         ev('e5',ident[0] if ident else w[3][3],'identify',idText,T1['key'],ident[1]['key'] if ident else None),
         ev('e6',w[2][3],'terminal','Terminal dive begins: 41 deg descent to the aim point, 5 m AGL',T1['key'],None)]
    f=[cue[0],conf[0],ident[0] if ident else w[3][3]]
    warn=(w[3][3]-cue[0])
    cards=[
      card('c1','Laydown','plan',None,[],'One-way attack: one Tanq 5 inch FPV runs the fly-area axis at 15 m/s and 40 m AGL, then dives at 41 deg to an aim point 60 m short of the cameras. No payload.',
           'Plan section 8: at 15 m/s, 1 s of timing offset is 15 m of range. The clock record decides the range uncertainty on this profile.'),
      card('c2','First cue','plan',f[0],[T1['key'],cue[1]['key']],f"First possible cue expected from {cue[1]['id']} at {cue[1]['zoom']} ({PX['cue']} px on a {W_TANQ:g} m Tanq). Warning time to the aim point: about {warn:.0f} s.",
           'Mark first possible, first confirmed and first identified as separate events in each camera (plan section 7, step 6). Each event links to its frame and GCS position.'),
      card('c3','Identified','plan',f[2],[T1['key']]+([ident[1]['key']] if ident else []),idText+f". The 80 deg cameras reach {PX['identified']} px on a Tanq only inside {reach(W_TANQ,HFOV['1x'][0],PX['identified']):.0f} m, past the aim point. Record horizontal and slant range at each event per camera.",
           'The identification criterion is written before the run (plan section 8): a reviewer locates the same moving target across consecutive frames without the flight log as a cue.'),
      card('c4','Dive, side view','elevation',(w[2][3]+w[3][3])/2,[T1['key']],'The terminal descent along the path: 40 m AGL to 5 m over 40 m of ground. Steep, short warning.',
           lossLine(sensors)+' The 80 deg cameras hold it to the aim point. Flag the zoomed results FOV-limited from those ranges.'),
      card('c5','The run, 3D','3d',f[1],[T1['key']],'The run in 3D at the confirmed detection.','Orbit to show the camera sectors against the descent.'),
      card('c6','Attack slice','plan',w[1][3],[T1['key']],'Launch to impact at x2.','Play in the brief: about 35 s from launch to the aim point.',
           clip={'t0S':round(w[1][3]),'t1S':round(w[-1][4]),'rate':2,'beatsS':[]}),
    ]
    Q=q('When, and at what ground and slant range, does each camera first cue, confirm and identify a Tanq FPV on a direct 15 m/s run to a ground point, and what warning time remains?',
        'Response: first possible, confirmed and identified time per camera, with ground and slant range and the timing uncertainty (plan section 8). Hold: 15 m/s, 40 m AGL, head-on, 41 deg terminal descent. Vary: none in this profile; the Controlled repeat varies one factor. Record: sun, sky background, wind. Replicates: 3 runs. Target-absent interval: 120 s before launch.')
    notes=('Second in the order, after the ladder. Three replicate runs. The Tanq flies the fly-area axis from the NW launch point at 15 m/s and 40 m AGL, then descends at 41 deg to the aim point 60 m short of the camera line and holds at 5 m AGL. '
           'Simulated attack: no payload, no flight toward people. The deck lists the OWA as single and as a swarm; the swarm profile covers the multi-aircraft case. '
           +CLOCK+' '+SAFETY)
    v=vignette('JIOP-2','One-way attack, Tanq FPV direct run','One-way attack',Q,[T1],sensors,ns,areas,planes([('Run altitude 40 m AGL',40),CEIL]),evs,[],cards,
        [m('1.1.1','>=',90,'%'),m('1.1.2','>=',300,'m'),m('1.1.3','>=',300,'m'),m('2.1.3','>=',150,'m'),m('2.1.3t','<=',10,'s')],notes,
        ['Warning time per camera: first cue to aim point arrival, from the event table and the GCS log'],truthKeys(ns))
    return v

# ---------------------------------------------------------------- 3. Swarm
def swarm():
    sensors=cams_baseline(W_TANQ); ns=nodes()   # five of seven are Tanq; the reach is the conservative one
    def L(s,a): return P(s,a)
    T=[]
    # Mavic 3 pair, line abreast, slow
    for id,a,z,a2 in (('T1',-12,50,-18),('T2',12,60,18)):
        lp=L(-266,a); T.append(threat(id,'g1-quad-isr',[wp(lp,0,120),wp(lp,z),wp(P(120,a2),z,15)],6,'A'))
    # Tanq crossing pair
    lp=L(-265,-16); T.append(threat('T3','g1-fpv-rf',[wp(lp,0,120),wp(lp,25),wp(P(-150,18),25),wp(P(-30,-18),25),wp(P(90,18),25),wp(P(135,-8),25,10)],12,'B'))
    lp=L(-265,16);  T.append(threat('T4','g1-fpv-rf',[wp(lp,0,120),wp(lp,30),wp(P(-150,-18),30),wp(P(-30,18),30),wp(P(90,-18),30),wp(P(135,8),30,10)],12,'B'))
    # Tanq fast runner, delayed 20 s
    lp=L(-265,0);   T.append(threat('T5','g1-fpv-rf',[wp(lp,0,140),wp(lp,20),wp(P(150,0),20,10)],16,'B'))
    # Tanq close pair
    for id,a in (('T6',-8),('T7',8)):
        lp=L(-265,a); T.append(threat(id,'g1-fpv-rf',[wp(lp,0,120),wp(lp,35),wp(P(110,a),35,10)],10,'B'))
    W={t['id']:timed(t['path'],t['speedMs']) for t in T}
    areas=rangeAreas()+[da()]
    evs=[ev('e1',0,'checkpoint','Recording on; target-absent interval (120 s)',T[0]['key'],None)]
    # crossing times: T3 and T4 meet on the axis at s=-90 and s=30 (a=0) by symmetry
    def tAt(w,s):
        best=None
        for t in range(0,int(w[-1][4])+1):
            p=posAt(w,t); sp=(p[0]-CEN[0])*U[0]+(p[1]-CEN[1])*U[1]
            if best is None or abs(sp-s)<best[0]: best=(abs(sp-s),t)
        return best[1]
    x1=tAt(W['T3'],-90); x2=tAt(W['T3'],30)
    evs.append(ev('e2',x1,'checkpoint','T3 and T4 cross on the axis (first crossing)',T[2]['key'],None))
    evs.append(ev('e3',x2,'checkpoint','T3 and T4 cross on the axis (second crossing)',T[2]['key'],None))
    f5=firstAt(sensors[3],W['T5'],PX['cue'])
    evs.append(ev('e4',f5,'detect',f"First cue on the runner expected (CAM-4, 5x, {PX['cue']} px) at about {groundAt(sensors[3],W['T5'],f5):.0f} m",T[4]['key'],sensors[3]['key']))
    evs.append(idEvent('e5',[s for s in sensors],W['T1'],T[0]['key'],'Mavic pair',W['T1'][-1][3]))
    tAll=max(w[1][3] for w in W.values())
    cards=[
      card('c1','Laydown','plan',None,[],'Swarm: seven aircraft in the fly area at once. Two Mavic 3 line abreast at 50 and 60 m AGL; a Tanq pair crossing the axis twice; a Tanq pair 16 m apart at 35 m; one Tanq runner at 16 m/s and 20 m AGL, launched 20 s late.',
           'Each aircraft logs its own GCS position. Review each camera for every aircraft separately; a detection must be associated with one aircraft by time and bearing against the logs.',layers={'envelopes':True}),
      card('c2','Density at the first crossing','plan',x1,[T[2]['key'],T[3]['key']],'First crossing of T3 and T4 on the axis, 5 m apart in height. The closest spacing in the run; it tests 1.8 Resolution and the association rule.',
           'Record which cameras show two targets at the crossing and which show one. Count a merged pair as a missed observation for the hidden aircraft.',layers={'envelopes':True}),
      card('c3','Runner cue','plan',f5,[T[4]['key'],sensors[3]['key']],'The late runner at 16 m/s and 20 m AGL enters the 5x camera reach while the pairs are already in the image: the cue must be associated with T5, not the pairs.',
           'The wrong-association count feeds 2.1.4. The 20 s launch delay separates the runner from the pairs in time.'),
      card('c4','Heights, side view','elevation',x2,[],'Side view from the camera site at the second crossing: five heights from 20 to 60 m AGL across the group.','Set the view From asset to read every aircraft against the camera elevation limits.',elev='fromAsset',layers={'envelopes':True}),
      card('c5','Swarm, 3D','3d',x2,[],'The seven paths in 3D at the second crossing, with the group hulls.','Orbit to show the vertical separation of the crossing pair.',layers={'envelopes':True}),
      card('c6','Swarm slice','plan',tAll,[],'Launch to the last arrival at x4, hulls on.','Play in the brief; the timeline shows one lane per aircraft against the four cameras.',layers={'envelopes':True},
           clip={'t0S':round(min(w[1][3] for w in W.values())),'t1S':round(max(w[-1][4] for w in W.values())),'rate':4,'beatsS':[]}),
    ]
    Q=q('With seven aircraft in the fly area at once, which aircraft does each camera detect, when and where, which observations are missed or false, and how often is an observation associated with the wrong aircraft?',
        'Response per camera per aircraft: detection events with ground and slant range; missed observations; false detections; wrong associations. Vary: spacing (crossing pair at 5 m vertical, close pair at 16 m), speed (6 to 16 m/s), altitude (20 to 60 m AGL). Hold: camera settings as the ladder baseline. Record: sun, background, wind. Replicates: 2 runs minimum. Target-absent interval: 120 s before launch. Multi-aircraft association extends the single-aircraft method of the plan.')
    notes=('Last in the order. Two replicate runs. Aircraft from the inventory: 2 DJI Mavic 3 (T1, T2) and 5 Rotor Riot Tanq 5 inch (T3 to T7). Launch all from the NW end; T5 launches 20 s after the others. '
           'T3 and T4 cross the axis twice with 5 m of height separation; T6 and T7 fly 16 m apart; T1 and T2 line abreast 36 m apart. Every aircraft holds its own altitude. '
           'Review rule: an observation counts for an aircraft only when its bearing and time agree with that aircraft GCS log within the stated uncertainty; otherwise log it as a wrong association. '
           +CLOCK+' '+SAFETY)
    v=vignette('JIOP-3','Swarm, seven aircraft with crossings','Multi-aircraft',Q,T,sensors,ns,areas,planes([('Runner 20 m AGL',20),('Mavic pair 50 to 60 m AGL',60),CEIL]),evs,[x1,x2,f5+1],cards,
        [m('1.1.1','>=',90,'%'),m('1.6','>=',7,'targets'),m('1.8','<=',20,'m'),m('2.1.4','<=',10,'%'),m('1.1.4','<=',2,'per hour')],notes,
        ['Association table per camera: observation, aircraft assigned, bearing and time residual against the GCS log, wrong-association flag','Missed-observation list per aircraft per camera'],truthKeys(ns))
    return v

# ---------------------------------------------------------------- 4. Controlled Repeat
def controlledRepeat():
    base=cams_baseline(); ns=nodes()
    # CAM-3 and CAM-4 are the varifocal cameras: baseline at 1x (80 deg), factor level at 5x (17.6 deg)
    c3a=cam('CAM-3 1x',CAMPOS[2],'1x'); c4a=cam('CAM-4 1x',CAMPOS[3],'1x')
    c3b=cam('CAM-3 5x',CAMPOS[2],'5x'); c4b=cam('CAM-4 5x',CAMPOS[3],'5x')
    sensors=[base[0],base[1],c3a,c4a,c3b,c4b]
    path=[wp(LAUNCH,0,120),wp(LAUNCH,40),wp(P(150),40,10)]
    T1=threat('T1','g1-quad-isr',path,8)
    w=timed(path,8)
    areas=rangeAreas()+[da()]
    f=[firstWindow(s,w) for s in sensors]
    evs=[ev('e1',0,'checkpoint','Recording on; target-absent interval (120 s)',T1['key'],None),
         ev('e2',f[4]+1,'detect','First cue, factor level (CAM-3 at 5x)',T1['key'],c3b['key']),
         ev('e3',f[2]+1,'checkpoint','First cue, baseline level (CAM-3 at 1x) expected here',T1['key'],None),
         idEvent('e4',sensors,w,T1['key'],'Mavic 3',w[-1][3])]
    cards=[
      card('c1','Laydown','plan',None,[],'Controlled repeat: the same Mavic 3 approach (40 m AGL, 8 m/s, head-on) flown with the varifocal cameras at 1x, then at 5x. CAM-1 and CAM-2 are held constant as the control.',
           'One factor at two levels: optical zoom on CAM-3 and CAM-4. Three replicate runs per level, alternating levels run to run so sky and sun changes do not confound the factor.'),
      card('c2','Baseline level','plan',f[2]+1,[T1['key'],base[0]['key'],base[1]['key'],c3a['key'],c4a['key']],'Baseline: all four cameras at 80 deg. The planning reach is the same on every camera, so the four first-cue ranges should agree within the measurement uncertainty.',
           'Use the spread between CAM-1 to CAM-4 at the baseline as the repeatability floor for the comparison.'),
      card('c3','Factor level','plan',f[4]+1,[T1['key'],c3b['key'],c4b['key']],'Factor level: CAM-3 and CAM-4 at 5x. The planning reach moves out; the vertical FOV narrows, so the near end of the run is FOV-limited at 5x.',
           'Report the difference in first-cue range between levels with the run-to-run variation at each level (plan section 7, step 8: distributions, not the single longest detection).'),
      card('c4','FOV loss at 5x','elevation',w[2][3]-8,[T1['key'],c3b['key'],c4b['key']],'Side view near the end of the run: the target climbs above the 5x vertical FOV while the 80 deg cameras still hold it.',
           'Flag the 5x trials FOV-limited from this point (plan section 6). Do not read the loss as an optical limit.'),
      card('c5','Both levels, 3D','3d',f[2]+1,[T1['key']],'The two sector sets from the same four positions.','Orbit to separate the 80 deg and the 17.6 deg sectors.'),
      card('c6','Run slice','plan',w[1][3],[T1['key']],'Launch to the end of the run at x4.','Play the slice; compare the CAM-3 1x and CAM-3 5x rows on the timeline for the same path.',
           clip={'t0S':round(w[1][3]),'t1S':round(w[-1][4]),'rate':4,'beatsS':[]}),
    ]
    Q=q('Does optical zoom (1x against 5x) on the varifocal cameras change the first-cue, confirmed and identified ranges for the same Mavic 3 approach, and by how much against the run-to-run variation?',
        'Response: first possible, confirmed and identified range per camera per run; the difference between levels and the spread within a level. Vary: optical zoom on CAM-3 and CAM-4 (1x, 5x). Hold: CAM-1 and CAM-2 at 80 deg, 40 m AGL, 8 m/s, head-on, same path. Record: sun, sky background, wind. Replicates: 3 runs per level, levels alternated. Target-absent interval: 120 s before launch. A second factor, defined background condition, can replace zoom with the same profile.')
    notes=('Third in the order, after the One-way attack. Six runs: three at 1x, three at 5x, alternating levels (1x, 5x, 1x, 5x, 1x, 5x). Same path on every run: launch at the NW end, climb to 40 m AGL, direct approach at 8 m/s to 50 m short of the camera line, hold 10 s. '
           'Use true optical zoom, not digital crop (plan section 7, step 2); lock focus after the preflight; record the configuration snapshot before each run. '
           'Report per camera: median and percentile first-confirmed range per level, the difference between levels, and the within-level spread (Appendix C.2). '
           +CLOCK+' '+SAFETY)
    v=vignette('JIOP-4','Controlled repeat, optical zoom 1x against 5x','Counter-UAS',Q,[T1],sensors,ns,areas,planes([('Run altitude 40 m AGL',40),CEIL]),evs,[],cards,
        [m('1.1.1','>=',90,'%'),m('1.1.2','>=',250,'m'),m('1.1.3','>=',250,'m'),m('2.1.3','>=',120,'m')],notes,
        ['Comparison table: level, run, camera, first possible, confirmed and identified range; level difference with the within-level spread'],truthKeys(ns))
    return v

VS=[rangeLadder(),oneWayAttack(),swarm(),controlledRepeat()]
for v in VS:
    report(v)
    json.dump(v,open(f"{v['id']}.json",'w'),indent=1)
    print('  bytes',len(json.dumps(v)))
json.dump(VS,open('all.json','w'))
