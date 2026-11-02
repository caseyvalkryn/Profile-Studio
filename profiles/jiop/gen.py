import json, math, uuid, datetime
G=json.load(open('geom.json'))
ORIGIN=G['origin']; FLY=G['fly']; RANCH=G['ranch']
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
B=142.18432765605763; rad=math.radians(B)
U=(math.sin(rad),math.cos(rad)); V=(math.cos(rad),-math.sin(rad))  # V: across, left-hand side (NE)
CEN=(10.418721773852523,-52.86877459057709)
def P(s,a=0.0): return (round(CEN[0]+s*U[0]+a*V[0],1), round(CEN[1]+s*U[1]+a*V[1],1))
def key(): return str(uuid.uuid4())
def inside(pt,poly):
    x,y=pt; n=len(poly); ins=False
    for i in range(n):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%n]
        if (y1>y)!=(y2>y) and x < (x2-x1)*(y-y1)/(y2-y1)+x1: ins=not ins
    return ins
def edgeDist(pt,poly):
    x,y=pt; best=1e9
    for i in range(len(poly)):
        x1,y1=poly[i]; x2,y2=poly[(i+1)%len(poly)]
        dx,dy=x2-x1,y2-y1; L2=dx*dx+dy*dy
        t=max(0,min(1,((x-x1)*dx+(y-y1)*dy)/L2))
        best=min(best,math.hypot(x-(x1+t*dx),y-(y1+t*dy)))
    return best
def clipBand(poly,s1,s2):
    # Sutherland-Hodgman against s>=s1 and s<=s2 where s=(p-CEN).U
    def sOf(p): return (p[0]-CEN[0])*U[0]+(p[1]-CEN[1])*U[1]
    def clip(pts,keep,bound):
        out=[]
        for i in range(len(pts)):
            a=pts[i]; b=pts[(i+1)%len(pts)]; ka=keep(sOf(a)); kb=keep(sOf(b))
            if ka: out.append(a)
            if ka!=kb:
                t=(bound-sOf(a))/(sOf(b)-sOf(a)); out.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
        return out
    r=clip([tuple(p) for p in poly],lambda s:s>=s1,s1); r=clip(r,lambda s:s<=s2,s2)
    return [[round(x,1),round(y,1)] for x,y in r]

# ---- shared parts
SITE={'name':'TST Ranch, Carthage NC','lat':ORIGIN[0],'lon':ORIGIN[1],'elevM':150}
COLL='JIOPs four-camera test, TST Ranch, 12 to 13 Nov 2026'
S_CAM=200
CAMPOS=[P(S_CAM,a) for a in (-15,-5,5,15)]
LAUNCH=P(-270)
def wp(pt,z,hold=0): return {'key':key(),'x':pt[0],'y':pt[1],'z':z,'holdS':hold}
def sensorModel(rangeM): return {'pd':{'kind':'logistic','r50M':0.8*rangeM,'widthM':0.1*rangeM},'scanS':1,'trackM':3,'trackN':5,'coastS':10,'idDwellS':5,'pCorrectId':0.9,'trackErrorM':5}
# ---- camera planning model (review of 2026-11-02: tilt, sensor aspect, zoom FOV, aim, pixel thresholds)
# Every limit on the page and in the profiles derives from these constants. Change them here and
# regenerate (profiles.py, then page.py).
SENSOR={'4:3':(2560,1920),'16:9':(2560,1440)}
ASPECT='4:3'   # the Appendix B example (2560 x 1920); confirm the purchased model, a 16:9 sensor narrows the vertical FOV
NPX=2560
HFOV={'1x':(80.0,'Appendix B example value, 80 deg horizontal; confirm against the purchased model'),
      '2x':(round(2*math.degrees(math.atan(math.tan(math.radians(40))/2)),1),'Derived: 2x optical zoom of the 80 deg lens, 2 atan(tan 40 deg / 2); replace with the lens spec at the zoom step set'),
      '5x':(17.6,'Spec value at 5x (a true 5x of the 80 deg lens gives 19.0 deg); replace with the lens spec at the zoom step set')}
TILT={'CAM-1':10.0,'CAM-2':10.0,'CAM-3':8.0,'CAM-4':6.0}   # deg up from level; set on the mount and record in the camera survey
AIM_S=100   # each camera is yawed to the axis point 100 m before the camera line (the dive start); record the azimuth
W_MAVIC=0.4; W_TANQ=0.25   # projected width, m
PX={'cue':3,'confirmed':5,'identified':8}   # planning thresholds in pixels across the width (Johnson: detection 2, recognition 8)
SITE_MAX=500   # a reach beyond the launch point is site-limited; the sensor keeps this value
def vfov(h,aspect=ASPECT):
    w,hh=SENSOR[aspect]; return 2*math.degrees(math.atan(math.tan(math.radians(h/2))*hh/w))
def pixels(width,hfov,d): return width*NPX/(2*d*math.tan(math.radians(hfov/2)))
def reach(width,hfov,px): return min(SITE_MAX,width*NPX/(2*math.tan(math.radians(hfov/2))*px))
def lossAt(elMax,z=40.0,lens=2.5):
    """Ground distance inside which a target at z m AGL sits above the upper elevation limit."""
    return (z-lens)/math.tan(math.radians(elMax)) if elMax>0 else float('inf')
def aimBearing(pos):
    ax,ay=P(S_CAM-AIM_S); return round(math.degrees(math.atan2(ax-pos[0],ay-pos[1]))%360,1)
def cam(id,pos,zoom,width=W_MAVIC,tilt=None):
    base=id.split(' ')[0]; h,src=HFOV[zoom]; v=vfov(h); tilt=TILT[base] if tilt is None else tilt
    r=round(reach(width,h,PX['cue']))
    note=f"{src}; tilt {tilt:g} deg up; sensor {SENSOR[ASPECT][0]} x {SENSOR[ASPECT][1]} ({ASPECT}) so vertical FOV {v:.1f} deg; reach {r} m at {PX['cue']} px on a {width:g} m target"
    return {'key':key(),'id':id,'kind':'eoir','x':pos[0],'y':pos[1],'z':2.5,'rangeM':r,'minRangeM':0,'fovDeg':h,'bearingDeg':aimBearing(pos),
            'elMinDeg':round(tilt-v/2,1),'elMaxDeg':round(tilt+v/2,1),'model':sensorModel(r),'entered':{'1.3':{'value':h,'source':note}},
            'zoom':zoom,'tiltDeg':tilt,'widthM':width}
ZOOM_OF={'CAM-1':'1x','CAM-2':'1x','CAM-3':'2x','CAM-4':'5x'}
def cams_baseline(width=W_MAVIC):
    return [cam(id,CAMPOS[i],ZOOM_OF[id],width) for i,id in enumerate(('CAM-1','CAM-2','CAM-3','CAM-4'))]
def strip(s):
    """The sensor as the profile stores it: without the planning fields."""
    return {k:v for k,v in s.items() if k not in ('zoom','tiltDeg','widthM')}
def camName(s): return s['id'] if s['id'].endswith('x') else f"{s['id']}, {s['zoom']}"
def firstAt(sensor,w,px):
    """First second after launch (the end of the ground hold) at which the target is covered and at least px pixels wide; None when never."""
    end=w[-1][4]
    for t in range(int(math.ceil(w[0][4])),int(end)+1):
        p=posAt(w,t)
        if covered(sensor,p) and pixels(sensor['widthM'],sensor['fovDeg'],math.hypot(p[0]-sensor['x'],p[1]-sensor['y'],p[2]-sensor['z']))>=px: return t
    return None
def earliestAt(sensors,w,px):
    """(t, sensor) of the first camera to reach px pixels on the path; None when none does."""
    best=None
    for s in sensors:
        t=firstAt(s,w,px)
        if t is not None and (best is None or t<best[0]): best=(t,s)
    return best
def idEvent(id,sensors,w,tk,what,endT):
    """The identified event: the earliest camera at the identification pixel count, else a checkpoint at endT."""
    hit=earliestAt(sensors,w,PX['identified'])
    if hit: return ev(id,hit[0],'identify',f"{what} identified expected ({camName(hit[1])}, {PX['identified']} px) at about {groundAt(hit[1],w,hit[0]):.0f} m",tk,hit[1]['key'])
    return ev(id,endT,'checkpoint',f"{what} identified ({PX['identified']} px) not expected in any camera on this path",tk,None)
def groundAt(sensor,w,t):
    p=posAt(w,t); return math.hypot(p[0]-sensor['x'],p[1]-sensor['y'])
def node(id,kind,pt,rangeM=0): return {'key':key(),'id':id,'kind':kind,'x':pt[0],'y':pt[1],'z':0,'rangeM':rangeM,'fovDeg':0,'bearingDeg':0}
def nodes():
    gcs=P(-285,-10); rec=P(215,0)
    return [node('GCS-1','c2',gcs),node('REC-1','c2',rec),node('TM-1','tspi',gcs),node('TM-2','tspi',rec)]
def square(c,side): h=side/2; return [[c[0]-h,c[1]-h],[c[0]+h,c[1]-h],[c[0]+h,c[1]+h],[c[0]-h,c[1]+h]]
def area(id,kind,label,pts,zmax=0): return {'key':key(),'id':id,'kind':kind,'label':label,'pts':pts,'zMinM':0,'zMaxM':zmax}
def rangeAreas(): return [area('RNG-1','range','UAS Fly Area',[list(p) for p in FLY]),area('RNG-2','range','TST Ranch',[list(p) for p in RANCH])]
def da(): return area('DA','asset','Camera site',square(P(S_CAM),24))
def planes(zs):
    return [{'key':key(),'id':f'HP-{i+1}','label':l,'zM':z} for i,(l,z) in enumerate(zs)]
def q(text,note): return {'key':key(),'id':'Q-01','text':text,'note':note}
def m(id,op,th,unit): return {'id':id,'op':op,'threshold':th,'unit':unit}
def threat(id,type,path,speed,group=''): return {'key':key(),'id':id,'type':type,'path':path,'speedMs':speed,'group':group}
DATA_COMMON=['Four camera recordings, RTSP main stream, continuous, native resolution, 25 fps, MP4 segments with timestamps',
 'Camera configuration snapshot per run per camera (Appendix B.1 JSON): resolution, fps, FOV, zoom, focus, exposure, time offset',
 'Camera survey record: WGS84 position, lens height, azimuth, tilt, roll, installation photo',
 'Aircraft GCS telemetry log at the maximum rate: GPS time, latitude, longitude, altitude, accuracy',
 'ATOS tag track for the same aircraft (VAL fused), for comparison with the GCS log',
 'Clock synchronization record: PC, camera, video and telemetry offsets with the measured uncertainty',
 'Detection event table per camera: first possible, first confirmed, first identified; frame index, UTC, still image, reviewer',
 'Computed ranges per event: aircraft and camera ENU positions, ground range, slant range, uncertainty, FOV-limited and occluded flags',
 'Environmental record per run: sun position, sky background, cloud, visibility, wind, obstructions',
 'Target-absent recording interval per run (120 s before launch) for the false-detection count']
# ---- timing and coverage replicas (engine/geo.ts)
def timed(path,v):
    t=0; out=[]
    for i,p in enumerate(path):
        if i: a=path[i-1]; t+=math.hypot(p['x']-a['x'],p['y']-a['y'],p['z']-a['z'])/v
        out.append((p['x'],p['y'],p['z'],t,t+p['holdS'])); t+=p['holdS']
    return out
def posAt(w,t):
    if t<=w[0][3]: return w[0][:3]
    for i in range(len(w)-1):
        a=w[i]; b=w[i+1]
        if t<=a[4]: return a[:3]
        if t<=b[3]:
            f=(t-a[4])/(b[3]-a[4]) if b[3]>a[4] else 1
            return (a[0]+f*(b[0]-a[0]),a[1]+f*(b[1]-a[1]),a[2]+f*(b[2]-a[2]))
    return w[-1][:3]
def covered(s,p):
    R=math.hypot(p[0]-s['x'],p[1]-s['y'],p[2]-s['z'])
    if R>s['rangeM']: return False
    br=math.degrees(math.atan2(p[0]-s['x'],p[1]-s['y']))%360
    d=abs((br-s['bearingDeg']+540)%360-180)
    if d>s['fovDeg']/2: return False
    el=math.degrees(math.atan2(p[2]-s['z'],math.hypot(p[0]-s['x'],p[1]-s['y'])))
    return s['elMinDeg']<=el<=s['elMaxDeg']
def windows(sensor,w):
    end=w[-1][4]; out=[]; cur=None
    for t in range(0,int(end)+1):
        c=covered(sensor,posAt(w,t))
        if c and cur is None: cur=t
        if not c and cur is not None: out.append((cur,t-1)); cur=None
    if cur is not None: out.append((cur,int(end)))
    return out
def card(id,name,kind,tS,focus,caption,notes,layers=None,clip=None,yaw=-35,pitch=55,elev='alongPath',ref='asset',zoom=1.0):
    L={'reach':True,'events':True,'envelopes':False,'telemetry':False,'labels':True}
    if layers: L.update(layers)
    return {'key':key(),'id':id,'name':name,'view':{'kind':kind,'centre':{'x':0,'y':0},'zoom':zoom,'yawDeg':yaw,'pitchDeg':pitch,'ref':ref,'elevationMode':elev},
            'layers':L,'displays':{'timeline':True,'chart':False,'readout':True},'clip':clip,'focus':focus,'tS':tS,'caption':caption,'notes':notes}
def ev(id,t,type,label,tk,sk): return {'key':key(),'id':id,'tS':round(t,1),'type':type,'label':label,'threatKey':tk,'sensorKey':sk}
def vignette(id,name,cls,Q,threats,sensors,nodes_,areas,planes_,events,snapshots,cards,measures,notes,data,truthKeys):
    return {'schema':'profile-studio/8','id':id,'name':name,'updated':NOW,'collection':COLL,'class':cls,'version':1,'site':SITE,
            'questions':[Q],'threats':threats,'sensors':[strip(s) for s in sensors],'effectors':[],'nodes':nodes_,'areas':areas,'planes':planes_,'events':events,
            'snapshots':snapshots,'cards':cards,'debrief':None,'chainTime':{'decisionS':5,'assignS':3},'measures':measures,
            'report':{'notes':notes,'dataSources':DATA_COMMON+data,'truth':{'source':'Aircraft GCS telemetry log (GPS time, lat, lon, alt); ATOS tag track as the second source','intervalS':0.2,'stationKeys':truthKeys}}}
def check(v):
    bad=[]
    for t in v['threats']:
        for w in t['path']:
            pt=(w['x'],w['y'])
            if not inside(pt,FLY): bad.append(f"{t['id']} waypoint {pt} outside the fly area")
            elif edgeDist(pt,FLY)<3: bad.append(f"{t['id']} waypoint {pt} within 3 m of the fly area edge")
    for s in v['sensors']+v['nodes']:
        if not inside((s['x'],s['y']),RANCH): bad.append(f"{s['id']} outside the ranch")
    return bad
def report(v):
    print('==',v['id'],v['name'])
    for t in v['threats']:
        w=timed(t['path'],t['speedMs']); print(f"  {t['id']} end {w[-1][4]:.0f} s")
        for s in v['sensors']:
            ws=windows(s,w)
            if ws:
                p=posAt(w,ws[0][0]); R=math.hypot(p[0]-s['x'],p[1]-s['y'])
                print(f"    {s['id']:10s} first {ws[0][0]:4d} s at {R:4.0f} m ground; windows {ws}")
            else: print(f"    {s['id']:10s} no window")
    for b in check(v): print('  !!',b)
