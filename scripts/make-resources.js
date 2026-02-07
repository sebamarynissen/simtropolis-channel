// # make-resources.js
// See #326
import traverse from './traverse-yaml.js';

const list = `
11241036:foundations-and-retaining-walls
6459978:meandering-bike-paths-resources
aarsgevogelte:stationsstraat-3-tilburg-resources
abbt:manhattanville-project-1st-pack-models
abbt:manhattanville-project-2nd-pack-models
abbt:manhattanville-project-3rd-pack-models
angry-mozart:american-truck-stop-resources
anubis89:old-small-town-rail-station-resources
blam:hidp-fx-chemicals-resources
blam:zaxbys-model
bsc:bat-props-jenx-amsterdam-central-buildings-v1
bsc:bat-props-jenx-amsterdam-central-buildings-v2
bsc:bat-props-jenx-paris-gare-du-nord-buildings-v2005
bsc:bat-props-jenx-paris-gare-du-nord-buildings-v2007
bsc:bat-props-jenx-paris-gare-orsay-building
bsc:sg-mega-residentials-vol01-models
bsc:sg-mega-residentials-vol02-models
bsc:sg-mega-residentials-vol03-models
bsc:sg-mega-residentials-vol04-models
bsc:sg-models-adult
bsc:sg-models-agriculture
bsc:sg-models-civic-rewards
bsc:sg-models-civic-services
bsc:sg-models-department-stores
bsc:sg-models-education
bsc:sg-models-entertainment
bsc:sg-models-grocery-stores
bsc:sg-models-hotels1
bsc:sg-models-hotels2
bsc:sg-models-iht
bsc:sg-models-im1
bsc:sg-models-im2
bsc:sg-models-large-stores
bsc:sg-models-malls
bsc:sg-models-medium-shops1
bsc:sg-models-motels
bsc:sg-models-offices-hirise1
bsc:sg-models-offices-hirise2
bsc:sg-models-offices-medium
bsc:sg-models-restaurants
bsc:sg-models-sainsbury
bsc:sg-models-small-shops
bsc:sg-models-transportation
bsc:sg-models-utilities
bsc:sg-models-w2w-commercials
buddybud:concrete-wall-addon-stairs-resources
burrodiablo:nuclear-power-plant-prop-pack
ceafus-88:burger-king-models
ceafus-88:car-repairs-auto-parts-model
cogeo:logistics-centre-dependency-pack
cogeo:spirulina-farms-resources
darknono35:american-international-building-props
delecto:abelia-residence-model
delecto:costa-obzor-model
delecto:pearl-sunshine-resources
delija21:ruins-resources
dexter:esso-service-station-resources
dexter:esso-service-station-resources-lhd
dexter:esso-service-station-resources-rhd
dolphinfox:lua-resources
fantozzi:audio-essentials
ferox:warsaw-main-station-model
gshmails:glr-station-1-model
gshmails:glr-station-2-model
gshmails:glr-station-3-model
hugues-aroux:field-paths-and-hedges-resources
hugues-aroux:field-paths-and-hedges-street-textures
hugues-aroux:field-paths-and-hedges-grass-textures
hund88:apt-inc-props
hund88:bakery-model
hund88:bauxim-al-co-props
hund88:effectimed-model
hund88:grain-field-model < wrong photos
hund88:massive-storage-inc-model
hund88:nova-energetics-model
hund88:ohm-resistors-model
hund88:quetz-isoprenes-co-props
hund88:sunflower-field-props
hund88:warehouse-model
ill-tonkso:bsc-its-birmingham-rotunda-model
ill-tonkso:portsbourne-railway-station-model
ill-tonkso:unreleased-set-vol1-resources
jaystimson:seawalls-v3-props
jbsimio:smalltown-usa-props-and-queries
kellydale2003:linda-swampy-medical-centre-model
khoianh94:european-bus-and-tram-stops-resources
lbt:residentials-models-vol01
lbt:residentials-models-vol02
madhatter106:surf-shacks-models
mandelsoft:stoplight-replacement-mod-post-models
mandelsoft:stoplight-replacement-mod-signal-models
marcosmx:el-rancho-mexican-restaurant-resources
mattb325:aliana-estate-prop-pack
mattb325:commercial-collection-shared-resources
mattb325:commercial-w2w-collection-shared-resources
mattb325:industrial-pack-shared-resources
mattb325:hotondo-homes-airlee-199-diagonal < incorrectly categorized
mattb325:passenger-ferry-terminal-v2 < Incorrectly categorized
mattb325:terminus-stations
mipro:essentials
mntoes:bosham-church-model
morifari:elevated-rail-embankment-props
murimk:nightowls-diagonal-industrial-fillers-and-extenders-resources
nbvc:corals-resources
nbvc:desert-pack-resources
nbvc:divers-and-boats-resources
nbvc:dolphins-resources
nbvc:driftwood-resources
nbvc:fishs-and-rays-resources
nbvc:grey-rocks-props
nbvc:high-rocks-resources
nbvc:logging-set-resources
nbvc:marina-resources
nbvc:marina-round-corners-resources
nbvc:modular-marina-addon-resources
nbvc:sailboats-resources
nbvc:sharks-resources
nbvc:shipwrecks-resources
nbvc:tents-resources
nbvc:turtles-resources
ndex:essentials
ndex:its-mega-pack-vol01
...
ndex:its-mega-pack-vol15
ndex:parking-lot-textures
ndex:superstar-mega-pack-vol01
...
ndex:superstar-mega-pack-vol05
nhp:essentials
nybt:essentials
nycc06:models-pack-vol01
...
nycc06:models-pack-vol06
odainsaker:alexander-column-resources
paeng:grunge-concrete-set-resources
paeng:modular-truckstop-resources
paeng:streetside-diagonal-parking-textures
paeng:urban-renewal-pure
peg:cdk3-boatyard-resource
peg:cdk3-coast-guard-station-resource
peg:cdk3-garbage-docks-resources
peg:chicken-ranch-props
peg:csk2-annabellelin-restaurant-resource
peg:lakeside-resort-props
peg:mtp-logging-resource
peg:mtp-scenic-views-props
peg:ppond-avenue-draw-bridge-resource
peg:ppond-kit-resources
peg:ppond-water-mill-resource
peg:pponds-canal-kit-resource
peg:the-great-lighthouse-of-alexandria-props
prepo:automobile-shredder-resources
rfr:deers-and-wild-boars-resources
roe99:resources
rretail:msm-commercial-brands-models-props
sfbt:essentials
sheep:europack-vol2-modern-block-model
simcityfreak666:european-busstops-models
simfox:p44towers-models
simfox:thermofisher-scientific-model
simhottoddy:pulkovo-airport-model
simmer2:center-pivot-irrigation-fields-resources
simmer2:sands-props
skyscraper:models-pack-vol01
...
skyscraper:models-pack-vol06
spa:the-lexington-models
swamper77:automata-essentials
szymcar:small-polish-residental-blocks-czestochowa-models
thequiltedllama:suburban-str-station-model
torresprei:sims-geographic-museum-ii-props
vicgon:lbt-hospitals-pack-models
vip:delecto-ploppable-people < incorrectly categorized
wmp:essentials
xannepan:jenx-amsterdam-central-station-resources
zero7:industrial-pack-shared-resources
`.trim().split('\n').map((line) => {
	const str = line.split('<').at(0).trim();
	if (str === '...') return null;
	return str;
}).filter(Boolean);
const set = new Set(list);

await traverse('**/*.yaml', (pkg) => {
	if (pkg.assetId) return;
	let id = `${pkg.group}:${pkg.name}`;
	if (set.has(id)) {
		pkg.subfolder = '110-resources';
		return pkg;
	}
});
