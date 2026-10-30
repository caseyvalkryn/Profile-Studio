(function (PS) {
  "use strict";
  var Sd = PS.seed = {};
  var Sc = PS.schema;

  // ---- v1 seed literal: copied unchanged from profile-studio-v1.html seed() ----
function seed(){ const sq=r=>[[-r,-r],[r,-r],[r,r],[-r,r]]; const cam=(proj,yaw=-35,pitch=55)=>({proj,yaw,pitch});
 return [
 {id:"CUAS-001",v:3,name:"Single Group 1 ingress with loiter",cls:"Counter-UAS",collection:"Toughstump",purpose:"How does one track hand off from detect to effect, and does the track hold through a hover?",
  scene:{aircraft:[{id:"T1",arch:"g1-quad-isr"}],
   systems:[{id:"RDR-1",kind:"radar",x:0,y:0,range:4000,fov:360,bearing:0},{id:"RF-1",kind:"rf",x:180,y:-90,range:3000,fov:360,bearing:0},{id:"EO-1",kind:"eoir",x:-140,y:70,range:2500,fov:30,bearing:45},{id:"EW-1",kind:"ew",x:0,y:0,range:1500,fov:360,bearing:0}],
   volumes:[{id:"DA",kind:"asset",label:"Defended asset",pts:sq(250),zmax:0}],planes:[{id:"P1",label:"120 m ceiling",z:120}],
   paths:[{id:"T1",aircraft:"T1",group:"",pts:[{x:3100,y:3000,z:120,hold:0},{x:1900,y:2650,z:120,hold:0},{x:1500,y:1500,z:120,hold:60},{x:180,y:160,z:120,hold:0}]}]},
  events:[{id:"e1",t:28,type:"detect",label:"Radar detect",path:"T1"},{id:"e2",t:46,type:"track",label:"Track init",path:"T1"},{id:"e3",t:150,type:"id",label:"EO identify",path:"T1"},{id:"e4",t:178,type:"loiter",label:"Loiter 60 s",path:"T1"},{id:"e5",t:262,type:"engage",label:"EW engage",path:"T1"},{id:"e6",t:300,type:"checkpoint",label:"Lost link, return home",path:"T1"}],
  telemetry:{truth:"Platform GPS, 10 Hz",interval:20,stations:["RDR-1"]},snapshots:[],
  data:["Radar plots and tracks, 1 Hz","RF detections with bearing","EO/IR video with KLV metadata","Effector on and off log"],
  mop:["Initial detection range at or above 3.0 km","Track continuity at or above 95 percent inside 3 km","Positive ID before 2.0 km","Effect observed within 20 s of engage"],
  cards:[{id:"c1",name:"Overview",cam:cam("plan"),layers:{reach:true,events:true,envelopes:false,telemetry:false,labels:true},focus:[],t:null,caption:"One Group 1 quadrotor enters from the north east, loiters at 1.5 km, then runs at the asset. Every sensor ring is drawn to scale.",notes:"Say the ranges out loud. Radar 4 km, RF 3 km, EO 2.5 km, effector 1.5 km. The audience should see that the handoffs are a geometry problem before they are a software problem."},
         {id:"c2",name:"The loiter",cam:cam("axon",-35,55),layers:{reach:false,events:true,envelopes:false,telemetry:false,labels:true},focus:["e4"],t:200,caption:"At t+200 s the aircraft is hovering. Track hold on a stationary target is the hard case for radar.",notes:"Pause here. Ask the evaluator what they expect the track quality to do during the hover."},
         {id:"c3",name:"Engage and effect",cam:cam("plan"),layers:{reach:true,events:true,envelopes:false,telemetry:false,labels:true},focus:["e5","e6"],t:300,caption:"Engage at 1.5 km inside the effector ring. The measure is effect within 20 s: lost link and return home.",notes:"Close on the MOP list. Four measures, each with a threshold."}]},
 {id:"MULTI-001",v:2,name:"Six Group 1, two elements, split then converge",cls:"Multi-aircraft",collection:"Toughstump",purpose:"How should a group of six read on scope, and when does one envelope become two?",
  scene:{aircraft:[{id:"S",arch:"g1-swarm-quad"}],
   systems:[{id:"RDR-1",kind:"radar",x:0,y:0,range:4000,fov:360,bearing:0},{id:"RF-1",kind:"rf",x:180,y:-90,range:3000,fov:360,bearing:0},{id:"EW-1",kind:"ew",x:0,y:0,range:1500,fov:360,bearing:0}],
   volumes:[{id:"DA",kind:"asset",label:"Defended asset",pts:sq(250),zmax:0}],planes:[],
   paths:[
    {id:"A1",aircraft:"S",group:"A",pts:[{x:3200,y:2200,z:100,hold:0},{x:2100,y:1500,z:100,hold:0},{x:1200,y:1300,z:100,hold:0},{x:150,y:120,z:100,hold:0}]},
    {id:"A2",aircraft:"S",group:"A",pts:[{x:3350,y:2350,z:110,hold:0},{x:2250,y:1650,z:110,hold:0},{x:1350,y:1450,z:110,hold:0},{x:120,y:180,z:110,hold:0}]},
    {id:"A3",aircraft:"S",group:"A",pts:[{x:3050,y:2400,z:90,hold:0},{x:1950,y:1700,z:90,hold:0},{x:1050,y:1500,z:90,hold:0},{x:60,y:200,z:90,hold:0}]},
    {id:"B1",aircraft:"S",group:"B",pts:[{x:3200,y:2200,z:100,hold:0},{x:2300,y:900,z:100,hold:0},{x:1200,y:-300,z:100,hold:0},{x:150,y:-120,z:100,hold:0}]},
    {id:"B2",aircraft:"S",group:"B",pts:[{x:3350,y:2050,z:105,hold:0},{x:2450,y:750,z:105,hold:0},{x:1350,y:-450,z:105,hold:0},{x:200,y:-60,z:105,hold:0}]},
    {id:"B3",aircraft:"S",group:"B",pts:[{x:3050,y:2050,z:95,hold:0},{x:2150,y:750,z:95,hold:0},{x:1050,y:-450,z:95,hold:0},{x:80,y:-200,z:95,hold:0}]}]},
  events:[{id:"e1",t:24,type:"detect",label:"Cluster detect",path:"A1"},{id:"e2",t:60,type:"track",label:"Group track",path:"A2"},{id:"e3",t:95,type:"split",label:"Split, one to two",path:"B1"},{id:"e4",t:170,type:"engage",label:"EW engage element B",path:"B2"},{id:"e5",t:200,type:"engage",label:"EW engage element A",path:"A3"}],
  telemetry:{truth:"Per airframe GPS, 10 Hz",interval:20,stations:["RDR-1"]},snapshots:[10,95,170],
  data:["Radar group track and member tracks, 1 Hz","Track correlation log, member to group","Effector on and off log"],
  mop:["Group track formed before 3.0 km","Correct element count within 10 s of split","Member count error at most 1 at all times","No defended asset entry by any airframe"],
  cards:[{id:"c1",name:"One envelope",cam:cam("plan"),layers:{reach:true,events:false,envelopes:true,telemetry:false,labels:true},focus:[],t:10,caption:"At launch the six read as one cluster. The envelope is the object the operator should see first.",notes:"Do not show member tracks yet. The point is count, not individuals."},
         {id:"c2",name:"The split",cam:cam("plan"),layers:{reach:false,events:true,envelopes:true,telemetry:false,labels:true},focus:["e3"],t:95,caption:"At t+95 s the envelope count goes from one to two. That moment is the split event, and it is what VAL should surface.",notes:"Ask: what does the C2 display do here today? Most show six tracks and leave the grouping to the operator."},
         {id:"c3",name:"Selected member",cam:cam("axon",-50,50),layers:{reach:false,events:true,envelopes:false,telemetry:true,labels:true},focus:["B2"],t:170,caption:"Member B2 selected with the telemetry layer on. Truth samples every 20 s, truth station link drawn.",notes:"This card is the detail view: one member, its truth, its engage event."}]},
 {id:"OWA-001",v:2,name:"Group 3 delta wing, low ingress, terminal dive",cls:"One-way attack",collection:"Toughstump",purpose:"Where in the geometry does the engage decision have to happen for a 46 m/s one way attack?",
  scene:{aircraft:[{id:"T1",arch:"g3-delta-owa"}],
   systems:[{id:"RDR-1",kind:"radar",x:0,y:0,range:9000,fov:360,bearing:0},{id:"EO-1",kind:"eoir",x:-140,y:70,range:5000,fov:30,bearing:225},{id:"KIN-1",kind:"kinetic",x:0,y:0,range:3000,fov:360,bearing:0}],
   volumes:[{id:"DA",kind:"asset",label:"Defended asset",pts:sq(300),zmax:0},{id:"WEZ",kind:"wez",label:"Engagement zone",pts:[[-3000,-3000],[-300,-3000],[-300,-300],[-3000,-300]],zmax:1200}],planes:[{id:"P1",label:"300 m cruise",z:300}],
   paths:[{id:"T1",aircraft:"T1",group:"",pts:[{x:-9200,y:-8200,z:300,hold:0},{x:-5000,y:-4400,z:300,hold:0},{x:-2400,y:-2100,z:260,hold:0},{x:-900,y:-800,z:150,hold:0},{x:-120,y:-100,z:20,hold:0}]}]},
  events:[{id:"e1",t:40,type:"detect",label:"Radar detect",path:"T1"},{id:"e2",t:62,type:"track",label:"Track init",path:"T1"},{id:"e3",t:140,type:"id",label:"EO identify",path:"T1"},{id:"e4",t:175,type:"engage",label:"Kinetic engage",path:"T1"},{id:"e5",t:200,type:"terminal",label:"Terminal dive",path:"T1"}],
  telemetry:{truth:"Platform GPS and IMU, 20 Hz",interval:20,stations:["RDR-1"]},snapshots:[],
  data:["Radar plots and tracks, 2 Hz","EO/IR video with KLV metadata","Effector fire log with time of flight"],
  mop:["Initial detection range at or above 8.0 km","Track quality at or above 0.8 through terminal phase","Engage decision at or above 2.5 km","Time from engage to effect at most 15 s"],
  cards:[{id:"c1",name:"Overview",cam:cam("plan"),layers:{reach:true,events:true,envelopes:false,telemetry:false,labels:true},focus:[],t:null,caption:"A piston delta wing from 12 km out, low cruise at 300 m, into the south west engagement zone.",notes:"Scale matters here: the radar ring is 9 km. Let the empty space do the work."},
         {id:"c2",name:"The dive",cam:cam("elev"),layers:{reach:true,events:true,envelopes:false,telemetry:false,labels:true},focus:["e4","e5"],t:null,caption:"Elevation carries the story. Level at 300 m, then the terminal dive from 2.4 km out.",notes:"Point at the engage event and the vertical kinetic reach line. The decision window is the gap between them."},
         {id:"c3",name:"Engagement volume",cam:cam("axon",-125,40),layers:{reach:false,events:true,envelopes:false,telemetry:false,labels:true},focus:["WEZ"],t:180,caption:"The engagement zone as a volume to 1,200 m. The aircraft is inside it at t+180 s.",notes:"3D only because height matters here. Return to plan for the close."}]},
 {id:"SURR-001",v:1,name:"Group 3 surrogate racetrack with truth",cls:"Surrogate",collection:"Reference",purpose:"How accurate is the sensor track against truth on a known pattern?",
  scene:{aircraft:[{id:"T1",arch:"g3-target-piston"}],
   systems:[{id:"RDR-1",kind:"radar",x:0,y:0,range:4000,fov:360,bearing:0},{id:"TM-1",kind:"truth",x:600,y:-400,range:3500,fov:360,bearing:0},{id:"RTK",kind:"truth",x:-500,y:-300,range:0,fov:0,bearing:0}],
   volumes:[{id:"RT",kind:"ref",label:"Reference racetrack",pts:[[1000,-800],[2800,-800],[3100,-500],[3100,500],[2800,800],[1000,800],[700,500],[700,-500]],zmax:0}],planes:[{id:"P1",label:"300 m block",z:300}],
   paths:[{id:"T1",aircraft:"T1",group:"",pts:[{x:1000,y:-800,z:300,hold:0},{x:2800,y:-800,z:300,hold:0},{x:3100,y:-500,z:300,hold:0},{x:3100,y:500,z:300,hold:0},{x:2800,y:800,z:300,hold:0},{x:1000,y:800,z:300,hold:0},{x:700,y:500,z:300,hold:0},{x:700,y:-500,z:300,hold:0},{x:1000,y:-800,z:300,hold:0}]}]},
  events:[{id:"e1",t:0,type:"checkpoint",label:"Lap start",path:"T1"},{id:"e2",t:55,type:"checkpoint",label:"Straight 1 end",path:"T1"},{id:"e3",t:98,type:"checkpoint",label:"Far turn",path:"T1"},{id:"e4",t:165,type:"checkpoint",label:"Straight 2 end",path:"T1"},{id:"e5",t:220,type:"checkpoint",label:"Lap complete",path:"T1"}],
  telemetry:{truth:"RTK GPS, 20 Hz, cm class",interval:10,stations:["TM-1","RTK"]},snapshots:[],
  data:["RTK GPS truth, 20 Hz","Radar track, 1 Hz, with covariance","Telemetry link margin and packet loss","Time sync log, PTP"],
  mop:["Track position error, 90th percentile, at most 15 m","Track latency at most 1.0 s","Telemetry packet loss at most 0.5 percent","Time sync error at most 10 ms"],
  cards:[{id:"c1",name:"The yardstick",cam:cam("plan"),layers:{reach:false,events:false,envelopes:false,telemetry:true,labels:true},focus:["RT"],t:null,caption:"A surrogate flies a fixed racetrack at 300 m with RTK truth. The pattern is the yardstick for every track metric.",notes:"This is the telemetry chapter. The same layer applies to any profile in the collection."},
         {id:"c2",name:"Truth at altitude",cam:cam("axon",-30,45),layers:{reach:false,events:true,envelopes:false,telemetry:true,labels:true},focus:[],t:98,caption:"Truth samples every 10 s. Two truth stations hold the aircraft at the far turn.",notes:"Height block shown by the reference plane."}]}
 ]; }
  // ---- end of v1 seed literal ----

  Sd.raw = function () { return seed(); };
  Sd.load = function () { return Sd.raw().map(Sc.migrate); };

  // templates (brief section 10): small v4 records with a site and no paths
  var sys = Sc.makeSystem, vol = Sc.makeVolume, sq = Sc.square;
  function base(id, name, cls) {
    var r = Sc.blank(id);
    r.name = name;
    r.cls = cls;
    r.scene.volumes = [];
    return r;
  }

  Sd.templates = [
    { id: "point-defence", name: "Point defence", make: function (id) {
      var r = base(id, "Point defence", "Counter-UAS");
      r.scene.volumes = [vol("DA", "asset", "Defended asset", sq(250), 0)];
      r.scene.systems = [sys("RDR-1", "radar", 0, 0, 4000), sys("RF-1", "rf", 180, -90, 3000), sys("EW-1", "ew", 0, 0, 1500)];
      return r;
    } },
    { id: "fixed-wing-ingress", name: "Fixed wing ingress", make: function (id) {
      var r = base(id, "Fixed wing ingress", "One-way attack");
      r.scene.volumes = [vol("DA", "asset", "Defended asset", sq(300), 0),
        vol("WEZ", "wez", "Engagement zone", [[-3000, -3000], [-300, -3000], [-300, -300], [-3000, -300]], 1200)];
      r.scene.systems = [sys("RDR-1", "radar", 0, 0, 9000), sys("EO-1", "eoir", -140, 70, 5000, 30, 225), sys("KIN-1", "kinetic", 0, 0, 3000)];
      return r;
    } },
    { id: "range-test", name: "Range test", make: function (id) {
      var r = base(id, "Range test", "Surrogate");
      r.scene.volumes = [vol("DA", "asset", "Defended asset", sq(250), 0),
        vol("RT", "ref", "Reference racetrack", [[1000, -800], [2800, -800], [3100, -500], [3100, 500], [2800, 800], [1000, 800], [700, 500], [700, -500]], 0)];
      r.scene.systems = [sys("RDR-1", "radar", 0, 0, 4000), sys("TM-1", "tspi", 600, -400, 3500), sys("RTK", "tspi", -500, -300, 0, 0)];
      r.telemetry.stations = ["TM-1", "RTK"];
      return r;
    } },
    { id: "swarm", name: "Swarm", make: function (id) {
      var r = base(id, "Swarm", "Multi-aircraft");
      r.scene.volumes = [vol("DA", "asset", "Defended asset", sq(250), 0)];
      r.scene.systems = [sys("RDR-1", "radar", 0, 0, 4000), sys("RF-1", "rf", 180, -90, 3000), sys("EW-1", "ew", 0, 0, 1500)];
      r.snapshots = [10, 95];
      return r;
    } },
    { id: "blank", name: "Blank", make: function (id) { return Sc.blank(id); } }
  ];
})(globalThis.PS);
