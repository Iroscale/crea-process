/**
 * Bibliothèque de régions françaises pour ciblage géographique des ads.
 *
 * Pour chaque région :
 *  - démonymes (M / F / collectif) : utilisés dans les headlines / body / CTA
 *  - villes : pour mentions locales
 *  - landmarks : éléments visuels iconiques pour les prompts d'image
 *  - architecture : style architectural typique (façades, toits, matériaux)
 *  - atmosphère : ambiance / lumière / mood
 *  - cultural : références culturelles vivantes (gastronomie, scènes, rythmes)
 *
 * Ces données sont injectées dans :
 *  - le system prompt de Claude lors de la finalisation du brief (angles +
 *    concepts adaptés)
 *  - les prompts d'image Gemini / Flux / GPT (landmarks dans le visuel)
 */

export type RegionId =
  | "international"
  | "ile_de_france"
  | "auvergne_rhone_alpes"
  | "bourgogne_franche_comte"
  | "bretagne"
  | "centre_val_de_loire"
  | "corse"
  | "grand_est"
  | "hauts_de_france"
  | "normandie"
  | "nouvelle_aquitaine"
  | "occitanie"
  | "pays_de_la_loire"
  | "paca"
  | "guadeloupe"
  | "martinique"
  | "guyane"
  | "la_reunion"
  | "mayotte";

export type Region = {
  id: RegionId;
  label: string;
  group: "international" | "métropole" | "drom";
  adjectives: {
    masculine: string[];
    feminine: string[];
    people: string[]; // collectif / pluriel
  };
  cities: string[];
  landmarks: string[];
  cultural: string[];
  architecture: string;
  atmosphere: string;
};

export const REGIONS: Record<RegionId, Region> = {
  international: {
    id: "international",
    label: "International (par défaut)",
    group: "international",
    adjectives: { masculine: [], feminine: [], people: [] },
    cities: [],
    landmarks: [],
    cultural: [],
    architecture: "",
    atmosphere: "",
  },

  ile_de_france: {
    id: "ile_de_france",
    label: "Île-de-France",
    group: "métropole",
    adjectives: {
      masculine: ["parisien", "francilien"],
      feminine: ["parisienne", "francilienne"],
      people: ["les Parisiens", "les Franciliens"],
    },
    cities: ["Paris", "Versailles", "Saint-Denis", "Boulogne-Billancourt", "Vincennes", "Neuilly"],
    landmarks: [
      "Tour Eiffel",
      "Arc de Triomphe",
      "Notre-Dame",
      "Sacré-Cœur de Montmartre",
      "Louvre + pyramide de verre",
      "Champs-Élysées",
      "Place de la Concorde",
      "ponts de la Seine",
      "métro parisien (entrées Guimard)",
      "Quartier de la Défense (gratte-ciels)",
    ],
    cultural: [
      "terrasse de café-bistrot avec chaises rouges/rotin",
      "boulangerie matinale, croissant + café crème",
      "rame de métro et carte Navigo",
      "marché parisien (Bastille, Aligre)",
      "boutiques du Marais",
      "balcons en fer forgé",
    ],
    architecture:
      "Haussmann (façades en pierre de taille blanche/crème, toits en zinc gris, balcons fer forgé filants au 2e et 5e, immeubles 6-7 étages alignés). Pour Paris extra-périphérique : bétons des années 60-70, cités HLM, ou pavillons banlieue.",
    atmosphere:
      "urban density, café culture, lumière dorée filtrant entre les immeubles, énergie de la capitale, trottoirs animés, hauteurs de toit-zinc à perte de vue, ambiance métro-boulot-dodo",
  },

  auvergne_rhone_alpes: {
    id: "auvergne_rhone_alpes",
    label: "Auvergne-Rhône-Alpes",
    group: "métropole",
    adjectives: {
      masculine: ["lyonnais", "stéphanois", "grenoblois", "auvergnat"],
      feminine: ["lyonnaise", "stéphanoise", "grenobloise", "auvergnate"],
      people: ["les Lyonnais", "les habitants de la région"],
    },
    cities: [
      "Lyon",
      "Grenoble",
      "Saint-Étienne",
      "Clermont-Ferrand",
      "Annecy",
      "Chambéry",
    ],
    landmarks: [
      "Basilique de Fourvière (Lyon)",
      "Place Bellecour + Vieux-Lyon (traboules pavées)",
      "Pont de la Guillotière sur le Rhône",
      "Mont-Blanc + Aiguilles de Chamonix",
      "Lac d'Annecy + montagnes en arrière-plan",
      "Puy de Dôme (Auvergne)",
      "Chartreuse / Belledonne (massifs)",
    ],
    cultural: [
      "bouchon lyonnais (table en bois, nappe vichy, vin en pot)",
      "marché de Croix-Rousse",
      "fête des Lumières (8 décembre)",
      "raclette / fondue savoyarde au chalet",
      "stations de ski (Courchevel, Tignes)",
    ],
    architecture:
      "Lyon : façades en pierre dorée / ocre, traboules étroites, toits tuiles canal. Annecy : maisons à pan de bois colorées au bord des canaux. Stations alpines : chalets bois et pierre, toits forte pente. Auvergne rurale : pierre volcanique noire, toits de lauzes.",
    atmosphere:
      "Lyon : confluence Rhône-Saône, lumière douce, gastronomie sérieuse. Alpes : air vif, montagnes dominantes, lumière cristalline d'altitude. Auvergne : volcans, paysages verts, lumière atlantique.",
  },

  paca: {
    id: "paca",
    label: "Provence-Alpes-Côte d'Azur",
    group: "métropole",
    adjectives: {
      masculine: ["marseillais", "niçois", "provençal", "varois"],
      feminine: ["marseillaise", "niçoise", "provençale", "varoise"],
      people: ["les Marseillais", "les Niçois", "les Provençaux"],
    },
    cities: ["Marseille", "Nice", "Aix-en-Provence", "Toulon", "Cannes", "Avignon"],
    landmarks: [
      "Notre-Dame de la Garde (Marseille)",
      "Vieux-Port de Marseille + ferry-boat",
      "Calanques (Cassis, Sugiton)",
      "Promenade des Anglais (Nice)",
      "Cours Mirabeau (Aix)",
      "Palais des Papes (Avignon)",
      "Mont Sainte-Victoire (Cézanne)",
      "champs de lavande de Valensole",
      "vieux ports méditerranéens",
    ],
    cultural: [
      "pétanque sous les platanes",
      "pastis en terrasse",
      "marché provençal (olives, herbes, savons de Marseille)",
      "panissa, navettes, calissons",
      "Festival de Cannes",
      "carnaval de Nice",
    ],
    architecture:
      "Marseille : façades ocre rosé / jaune pâle, toits tuiles romaines, persiennes vert provençal. Nice : façades pastel rose-jaune-ocre, balcons-trompe-l'œil. Provence rurale : mas en pierre sèche, toits tuiles canal, allée de cyprès et oliviers.",
    atmosphere:
      "lumière méditerranéenne forte et chaude (ombres tranchantes), bleu cobalt de la mer, blanc-ocre des façades, cigales, chaleur estivale, vent du large, terrasses ombragées",
  },

  occitanie: {
    id: "occitanie",
    label: "Occitanie",
    group: "métropole",
    adjectives: {
      masculine: ["toulousain", "montpelliérain", "occitan"],
      feminine: ["toulousaine", "montpelliéraine", "occitane"],
      people: ["les Toulousains", "les Montpelliérains", "les habitants du Sud-Ouest"],
    },
    cities: [
      "Toulouse",
      "Montpellier",
      "Nîmes",
      "Perpignan",
      "Carcassonne",
      "Albi",
    ],
    landmarks: [
      "Cité de Carcassonne (remparts médiévaux)",
      "Pont du Gard",
      "Place du Capitole (Toulouse, brique rose)",
      "Basilique Saint-Sernin",
      "Arènes de Nîmes",
      "Cathédrale d'Albi (cathédrale-forteresse)",
      "Pic du Canigou (Pyrénées-Orientales)",
      "Cévennes / Causses",
    ],
    cultural: [
      "rugby (Stade Toulousain)",
      "cassoulet, magret, foie gras",
      "fête de la Saint-Jean",
      "festival de Carcassonne",
      "marché de plein air, beaucoup de soleil",
      "vins du Languedoc",
    ],
    architecture:
      "Toulouse : briques roses / rouges (la Ville rose), toits tuiles canal, fenêtres hautes. Carcassonne / Albi : pierre calcaire et brique, fortifications. Pyrénées : pierre brute, toits ardoise.",
    atmosphere:
      "Toulouse : lumière dorée chaude qui réchauffe la brique rose, atmosphère méridionale décontractée. Pyrénées : lumière vive, pics enneigés. Méditerranée occitane : garrigue, lumière intense.",
  },

  nouvelle_aquitaine: {
    id: "nouvelle_aquitaine",
    label: "Nouvelle-Aquitaine",
    group: "métropole",
    adjectives: {
      masculine: ["bordelais", "basque", "landais", "limousin"],
      feminine: ["bordelaise", "basque", "landaise", "limousine"],
      people: ["les Bordelais", "les Basques", "les habitants du Sud-Ouest"],
    },
    cities: [
      "Bordeaux",
      "Biarritz",
      "Bayonne",
      "Limoges",
      "Pau",
      "La Rochelle",
    ],
    landmarks: [
      "Place de la Bourse + miroir d'eau (Bordeaux)",
      "Pont de pierre sur la Garonne",
      "Vignobles du Médoc (rangées de vignes à perte de vue)",
      "Dune du Pilat",
      "Côte basque + spots de surf (Côte des Basques)",
      "Bayonne (maisons à colombages rouges)",
      "Tours de la Rochelle",
    ],
    cultural: [
      "vin de Bordeaux + grands crus",
      "cannelés bordelais",
      "pelote basque, talo, piment d'Espelette",
      "surf à Hossegor",
      "fêtes de Bayonne (foulards rouges)",
      "huîtres d'Arcachon",
    ],
    architecture:
      "Bordeaux : pierre blonde / dorée XVIIIe siècle, balcons fer forgé, alignements rectilignes. Pays Basque : maisons blanches à colombages rouges (etxe), volets verts ou rouges. Côte landaise : architecture en pin maritime, cabanes de plage. Limousin : granit et toits ardoise.",
    atmosphere:
      "Bordeaux : élégance bourgeoise, lumière océanique douce. Côte basque : océan vert + falaises, énergie surf. Vignobles : ambiance sereine, lumière dorée du soir.",
  },

  bretagne: {
    id: "bretagne",
    label: "Bretagne",
    group: "métropole",
    adjectives: {
      masculine: ["breton", "rennais", "brestois", "nantais"],
      feminine: ["bretonne", "rennaise", "brestoise", "nantaise"],
      people: ["les Bretons", "les Rennais"],
    },
    cities: ["Rennes", "Brest", "Saint-Malo", "Quimper", "Vannes", "Lorient"],
    landmarks: [
      "Mont-Saint-Michel (frontière Normandie mais culturellement breton)",
      "Remparts de Saint-Malo + plage du Sillon",
      "Pointe du Raz (granit + océan)",
      "Mégalithes de Carnac",
      "Phare de la Vieille / d'Eckmühl",
      "Côtes de granit rose (Trégor)",
      "Maisons à pan de bois colorées (Rennes, Vannes)",
    ],
    cultural: [
      "crêpe + galette de sarrasin + cidre brut",
      "kouign-amann et caramel beurre salé",
      "fest-noz (musique celtique, biniou)",
      "drapeau noir et blanc Gwenn-ha-du",
      "marins-pêcheurs et chalutiers au port",
      "pluie fine, ciel changeant",
    ],
    architecture:
      "Bretagne côtière : granit gris brut, toits ardoise très foncés, fenêtres petites. Vieilles villes : maisons à pans de bois (Rennes, Vannes) colorées rouge/bleu/vert. Côte : phares blanc et noir, ports de pêche aux barques colorées.",
    atmosphere:
      "ciel changeant breton (nuages bas, lumières filtrées), embruns marins, vert intense des landes, granit gris-rose, atmosphère celtique, force de l'océan, mood un peu mélancolique mais authentique",
  },

  pays_de_la_loire: {
    id: "pays_de_la_loire",
    label: "Pays de la Loire",
    group: "métropole",
    adjectives: {
      masculine: ["nantais", "angevin", "manceau", "vendéen"],
      feminine: ["nantaise", "angevine", "mancelle", "vendéenne"],
      people: ["les Nantais", "les habitants de l'Ouest"],
    },
    cities: ["Nantes", "Angers", "Le Mans", "Saint-Nazaire", "La Roche-sur-Yon"],
    landmarks: [
      "Machines de l'île (Nantes — Grand Éléphant mécanique)",
      "Château des Ducs de Bretagne (Nantes)",
      "Cathédrale d'Angers + tapisserie de l'Apocalypse",
      "Circuit des 24 heures du Mans",
      "Côte vendéenne (plages atlantiques)",
      "Pont de Saint-Nazaire",
      "Marais salants de Guérande",
    ],
    cultural: [
      "Muscadet / vins de Loire",
      "Mâche nantaise, gâche brioche vendéenne",
      "Voyages de Jules Verne (Nantes)",
      "La fleur de sel de Guérande",
      "Atmosphère étudiante (Nantes, Angers)",
    ],
    architecture:
      "Nantes : pierre de tuffeau blanche, toits ardoise, passages vitrés (Pommeraye), industriels reconvertis (île de Nantes). Angers : tuffeau crème, château ardoise. Côte vendéenne : maisons basses chaulées blanches, volets bleus.",
    atmosphere:
      "lumière atlantique douce, vert intense des bocages, océan en arrière-plan, ambiance créative et innovante (Nantes), authenticité côtière vendéenne",
  },

  hauts_de_france: {
    id: "hauts_de_france",
    label: "Hauts-de-France",
    group: "métropole",
    adjectives: {
      masculine: ["lillois", "ch'ti", "amiénois"],
      feminine: ["lilloise", "ch'ti", "amiénoise"],
      people: ["les Lillois", "les Ch'tis", "les habitants du Nord"],
    },
    cities: ["Lille", "Amiens", "Calais", "Dunkerque", "Roubaix", "Arras"],
    landmarks: [
      "Grand-Place de Lille (Vieille Bourse, Opéra)",
      "Beffroi de Lille / Arras (UNESCO)",
      "Cathédrale d'Amiens (la plus haute de France)",
      "Plages du Touquet / Côte d'Opale",
      "Falaises du Cap Blanc-Nez",
      "Terrils miniers (Loos-en-Gohelle, paysage minier UNESCO)",
      "Beffroi de Douai",
    ],
    cultural: [
      "carbonade flamande, moules-frites, maroilles, gaufre fourrée",
      "Bière du Nord (Goudale, Ch'ti)",
      "Estaminet (taverne flamande)",
      "Carnaval de Dunkerque",
      "Braderie de Lille (1er weekend de septembre)",
      "Esprit ch'ti (chaleur humaine, accent)",
    ],
    architecture:
      "Lille / Roubaix : façades en briques rouges (parfois jaunes), pignons à redents flamands, fenêtres blanches. Amiens : maisons hortillonnages, cathédrale gothique. Côte d'Opale : digues, villas balnéaires Belle Époque. Terrils : monts noirs charbonneux.",
    atmosphere:
      "ciel gris bas typique du Nord, briques rouges qui chauffent visuellement, lumière diffuse sans ombre dure, ambiance chaleureuse et sociable, vent du Nord, énergie post-industrielle qui se réinvente",
  },

  grand_est: {
    id: "grand_est",
    label: "Grand Est",
    group: "métropole",
    adjectives: {
      masculine: ["alsacien", "lorrain", "champenois", "strasbourgeois"],
      feminine: ["alsacienne", "lorraine", "champenoise", "strasbourgeoise"],
      people: ["les Alsaciens", "les Strasbourgeois", "les Champenois"],
    },
    cities: [
      "Strasbourg",
      "Reims",
      "Metz",
      "Nancy",
      "Mulhouse",
      "Colmar",
      "Troyes",
    ],
    landmarks: [
      "Cathédrale de Strasbourg (rose grès des Vosges)",
      "Petite France (Strasbourg, canaux + colombages)",
      "Cathédrale de Reims (sacre des rois)",
      "Place Stanislas (Nancy, classée UNESCO)",
      "Vignobles de Champagne (rangées géométriques)",
      "Vosges (sapinières, lacs)",
      "Marché de Noël de Strasbourg",
    ],
    cultural: [
      "choucroute, tarte flambée (Flammekueche), bretzel",
      "vin d'Alsace (Riesling, Gewurztraminer), bière, kougelhopf",
      "Champagne (Reims, Épernay)",
      "marché de Noël (vin chaud, sapins, manèges)",
      "chiens-loups, cigognes blanches, colombages",
    ],
    architecture:
      "Alsace : maisons à colombages très typées (poutres apparentes, encorbellements), volets colorés, toits pentus tuiles. Strasbourg : grès rose et colombages mêlés. Champagne : caves voûtées de craie, châteaux pierre claire. Vosges : chalets bois et pierre.",
    atmosphere:
      "Alsace : conte de fées (colombages, géraniums aux fenêtres), lumière dorée du Rhin. Champagne : vignobles ondulants, lumière cristalline. Vosges : forêts profondes vert sombre, brume matinale.",
  },

  bourgogne_franche_comte: {
    id: "bourgogne_franche_comte",
    label: "Bourgogne-Franche-Comté",
    group: "métropole",
    adjectives: {
      masculine: ["bourguignon", "dijonnais", "comtois"],
      feminine: ["bourguignonne", "dijonnaise", "comtoise"],
      people: ["les Bourguignons", "les Dijonnais"],
    },
    cities: ["Dijon", "Besançon", "Mâcon", "Chalon-sur-Saône", "Belfort"],
    landmarks: [
      "Hospices de Beaune (toits de tuiles vernissées polychromes)",
      "Palais des Ducs de Bourgogne (Dijon)",
      "Citadelle de Besançon (Vauban)",
      "Vignobles côte de Beaune / côte de Nuits (rangées impeccables)",
      "Mont Saint-Vincent / Massif du Jura",
      "Sources de la Loue",
    ],
    cultural: [
      "Grands crus de Bourgogne (Romanée-Conti, Meursault)",
      "Bœuf bourguignon, escargots, gougères",
      "Moutarde de Dijon, cassis (kir)",
      "Comté affiné, morbier, mont d'or",
      "Lacs et rivières du Jura",
    ],
    architecture:
      "Dijon : maisons à pans de bois colorées, toits de tuiles vernissées polychromes (vert-jaune-rouge-noir). Beaune : pierre claire, toits aux tuiles polychromes emblématiques. Vignobles : murets de pierre sèche entre les parcelles. Jura : chalets-fermes, comtoises avec horloges.",
    atmosphere:
      "lumière dorée typique de la Bourgogne (réfléchie par les pierres calcaires), géométrie patiente des vignobles, atmosphère gastronomique, calme rural, charme de l'arrière-pays.",
  },

  centre_val_de_loire: {
    id: "centre_val_de_loire",
    label: "Centre-Val de Loire",
    group: "métropole",
    adjectives: {
      masculine: ["tourangeau", "orléanais", "berrichon"],
      feminine: ["tourangelle", "orléanaise", "berrichonne"],
      people: ["les habitants du Val de Loire"],
    },
    cities: ["Tours", "Orléans", "Bourges", "Blois", "Chartres"],
    landmarks: [
      "Château de Chambord (façades blanches + 365 cheminées)",
      "Château de Chenonceau (sur le Cher)",
      "Cathédrale de Chartres (vitraux)",
      "Cathédrale de Bourges",
      "Loire fleuve (le plus long de France)",
      "Vouvray, Chinon, Sancerre (vignobles)",
      "Forêt de Sologne",
    ],
    cultural: [
      "vins de Loire (Sancerre, Vouvray, Bourgueil)",
      "tarte Tatin, rillettes de Tours, crottin de Chavignol",
      "Jeanne d'Arc (Orléans)",
      "atmosphère royale (les châteaux de la Loire)",
      "pêche en Loire, randonnée le long du fleuve",
    ],
    architecture:
      "Châteaux de la Loire : pierre de tuffeau crème, toits ardoise, tours coniques, jardins à la française. Tours : maisons à pans de bois et tuffeau. Sologne : briques rouges et bois.",
    atmosphere:
      "lumière douce du Val de Loire, fleuve scintillant, atmosphère noble et apaisée des châteaux, vert profond des forêts royales, jardins maîtrisés à perte de vue.",
  },

  normandie: {
    id: "normandie",
    label: "Normandie",
    group: "métropole",
    adjectives: {
      masculine: ["normand", "rouennais", "havrais", "caennais"],
      feminine: ["normande", "rouennaise", "havraise", "caennaise"],
      people: ["les Normands"],
    },
    cities: ["Rouen", "Caen", "Le Havre", "Cherbourg", "Deauville", "Honfleur"],
    landmarks: [
      "Mont-Saint-Michel (silhouette emblématique)",
      "Falaises d'Étretat (aiguille + arches)",
      "Plages du Débarquement (Omaha, Utah, Sword)",
      "Vieux-Bassin de Honfleur",
      "Cathédrale de Rouen (façade peinte par Monet)",
      "Tapisserie de Bayeux",
      "Pont de Normandie",
    ],
    cultural: [
      "cidre, calvados, pommeau",
      "camembert, livarot, neufchâtel",
      "tripes à la mode de Caen",
      "vaches normandes (noir et blanc)",
      "chevaux de selle français",
      "festival du Cinéma Américain de Deauville",
    ],
    architecture:
      "Maisons normandes à pans de bois (colombages), toits de chaume ou ardoise, parfois pierre calcaire blanche. Côte fleurie : villas balnéaires Belle Époque colorées. Bocage : prairies + haies + vaches.",
    atmosphere:
      "lumière atlantique douce et changeante (impressionniste — d'où Monet), ciel souvent voilé, vert profond des bocages, falaises blanches, ambiance maritime nostalgique, mer du Nord-Manche.",
  },

  corse: {
    id: "corse",
    label: "Corse",
    group: "métropole",
    adjectives: {
      masculine: ["corse", "ajaccien", "bastiais"],
      feminine: ["corse", "ajaccienne", "bastiaise"],
      people: ["les Corses", "l'île de Beauté"],
    },
    cities: ["Ajaccio", "Bastia", "Corte", "Bonifacio", "Calvi"],
    landmarks: [
      "Falaises de Bonifacio (calcaire blanc surplombant la mer)",
      "Citadelle de Calvi",
      "Aiguilles de Bavella",
      "Plages de Palombaggia, Santa Giulia (sable blanc + eau turquoise)",
      "Maison natale de Napoléon (Ajaccio)",
      "Vieux-Port de Bastia",
      "Cap Corse",
    ],
    cultural: [
      "charcuterie corse (figatellu, lonzu, coppa)",
      "fromage brocciu, fiadone",
      "polyphonies corses (chant sacré)",
      "miel corse, châtaigne",
      "drapeau Tête-de-Maure",
      "maquis (parfum de myrte, ciste, romarin)",
    ],
    architecture:
      "Maisons en pierre brute (granit ou schiste), toits de tuiles canal ou de lauzes, ouvertures étroites. Bonifacio : falaises avec maisons accrochées. Villages perchés de l'intérieur (Pigna, Sant'Antonino).",
    atmosphere:
      "lumière méditerranéenne intense, eau translucide turquoise, maquis odorant, montagnes plongeant dans la mer, esprit insulaire fier, mer omniprésente.",
  },

  guadeloupe: {
    id: "guadeloupe",
    label: "Guadeloupe",
    group: "drom",
    adjectives: {
      masculine: ["guadeloupéen"],
      feminine: ["guadeloupéenne"],
      people: ["les Guadeloupéens"],
    },
    cities: ["Pointe-à-Pitre", "Basse-Terre", "Le Gosier", "Sainte-Anne"],
    landmarks: [
      "Plages de Grande-Anse, La Caravelle (sable blanc + cocotiers)",
      "Chutes du Carbet (Basse-Terre)",
      "Volcan La Soufrière",
      "Mémorial ACTe (Pointe-à-Pitre)",
      "Marché aux épices",
      "Îles des Saintes",
    ],
    cultural: [
      "créole guadeloupéen",
      "ti-punch, planteur",
      "colombo, accras de morue",
      "musique Gwoka, zouk",
      "carnaval de Guadeloupe",
    ],
    architecture:
      "Cases créoles en bois colorées (jaune, bleu, rose) avec balcons et pergolas, toits de tôles ondulées rouges. Forts coloniaux en pierre.",
    atmosphere:
      "lumière tropicale éclatante, ciel bleu turquoise, eau translucide, végétation luxuriante, chaleur humide, énergie créole.",
  },

  martinique: {
    id: "martinique",
    label: "Martinique",
    group: "drom",
    adjectives: {
      masculine: ["martiniquais"],
      feminine: ["martiniquaise"],
      people: ["les Martiniquais"],
    },
    cities: ["Fort-de-France", "Le Lamentin", "Schoelcher", "Trinité"],
    landmarks: [
      "Mont Pelée (volcan)",
      "Anse Couleuvre",
      "Diamant Rock + plage du Diamant",
      "Cathédrale Saint-Louis (Fort-de-France)",
      "Distilleries de rhum AOC",
      "Forêt tropicale",
    ],
    cultural: [
      "créole martiniquais",
      "rhum agricole AOC, ti-punch",
      "boudin créole, blaff de poisson",
      "biguine, bèlè",
      "Madinina (île aux fleurs)",
    ],
    architecture:
      "Cases créoles colorées en bois, toits tôles, jardins tropicaux. Architecture coloniale française mêlée à l'identité antillaise.",
    atmosphere:
      "lumière tropicale chaude, mer Caraïbe turquoise, alizés, parfums fleuris, énergie biguine.",
  },

  guyane: {
    id: "guyane",
    label: "Guyane",
    group: "drom",
    adjectives: {
      masculine: ["guyanais"],
      feminine: ["guyanaise"],
      people: ["les Guyanais"],
    },
    cities: ["Cayenne", "Kourou", "Saint-Laurent-du-Maroni"],
    landmarks: [
      "Centre spatial de Kourou (fusée Ariane)",
      "Forêt amazonienne",
      "Îles du Salut (ancien bagne)",
      "Marais de Kaw",
      "Marché de Cayenne",
    ],
    cultural: [
      "créole guyanais, langues amérindiennes",
      "carnaval guyanais (touloulous)",
      "bouillon d'awara",
      "tonka, calou (poisson)",
      "biodiversité amazonienne",
    ],
    architecture:
      "Maisons créoles en bois, sur pilotis dans certaines zones, toits tôles. Architecture coloniale du XIXe siècle à Cayenne.",
    atmosphere:
      "chaleur équatoriale humide, forêt vert profond omniprésente, fleuves marrons, mélange culturel unique (créole / amérindien / hmong / brésilien).",
  },

  la_reunion: {
    id: "la_reunion",
    label: "La Réunion",
    group: "drom",
    adjectives: {
      masculine: ["réunionnais"],
      feminine: ["réunionnaise"],
      people: ["les Réunionnais"],
    },
    cities: ["Saint-Denis", "Saint-Pierre", "Saint-Paul", "Le Tampon"],
    landmarks: [
      "Piton de la Fournaise (volcan actif)",
      "Cirques de Mafate, Salazie, Cilaos",
      "Plages de l'Hermitage, Boucan Canot",
      "Cascade de Trou de Fer",
      "Kelonia (centre des tortues)",
      "Maïdo (point de vue sur Mafate)",
    ],
    cultural: [
      "créole réunionnais",
      "rougail saucisses, cari, achards",
      "rhum arrangé",
      "métissage indien / africain / chinois / européen",
      "maloya (musique inscrite UNESCO)",
    ],
    architecture:
      "Cases créoles colorées (toits varangues), à étages parfois (Cilaos, Hell-Bourg). Architecture indienne (temples tamoul colorés) et chinoise (pagodes) mélangées.",
    atmosphere:
      "lumière tropicale, océan Indien, montagnes vertigineuses (cirques), volcan, chaleur équilibrée par les hauts, métissage palpable, énergie maloya.",
  },

  mayotte: {
    id: "mayotte",
    label: "Mayotte",
    group: "drom",
    adjectives: {
      masculine: ["mahorais"],
      feminine: ["mahoraise"],
      people: ["les Mahorais"],
    },
    cities: ["Mamoudzou", "Dzaoudzi"],
    landmarks: [
      "Lagon de Mayotte (deuxième plus grand du monde)",
      "Mont Choungui",
      "Plages de N'Gouja, Sazile",
      "Îlot de sable blanc",
    ],
    cultural: [
      "shimaoré (langue locale)",
      "voulé (barbecue de poisson en plein air)",
      "plat du jour : mataba, brèdes mafane",
      "danses mahoraises (mbiwi, debaa)",
      "lambis, langoustes",
    ],
    architecture:
      "Cases en banga (paille de cocotier sur structure bois) ou maisons cubiques colorées en parpaings peints. Mosquées modestes.",
    atmosphere:
      "lumière équatoriale chaude, lagon turquoise omniprésent, végétation tropicale dense, ambiance comorienne / swahilie, sérénité insulaire.",
  },
};

export const REGIONS_LIST: Region[] = Object.values(REGIONS);

// Sorted, grouped lists for the UI dropdown
export const REGIONS_GROUPS = [
  {
    label: "Mode par défaut",
    regions: REGIONS_LIST.filter((r) => r.group === "international"),
  },
  {
    label: "France métropolitaine",
    regions: REGIONS_LIST.filter((r) => r.group === "métropole").sort(
      (a, b) => a.label.localeCompare(b.label, "fr")
    ),
  },
  {
    label: "DROM (Outre-mer)",
    regions: REGIONS_LIST.filter((r) => r.group === "drom").sort((a, b) =>
      a.label.localeCompare(b.label, "fr")
    ),
  },
];

// =============================================================================
// Prompt formatters — injected into Claude / image generation
// =============================================================================

/**
 * Format the region as a French paragraph injected into the system prompt of
 * finalizeBrief. Tells Claude to localise the angles and concept descriptions.
 */
export function formatRegionForBriefSystemPrompt(regionId: string): string {
  if (!regionId || regionId === "international") return "";
  const r = REGIONS[regionId as RegionId];
  if (!r) return "";
  const lines: string[] = [];
  lines.push(`# 🌍 CIBLAGE GÉOGRAPHIQUE — ${r.label.toUpperCase()}`);
  lines.push(
    `Cette campagne est ciblée sur la région **${r.label}**. Tous les angles, headlines, body, CTA et descriptions visuelles que tu produis doivent être ANCRÉS dans cette région.`
  );
  lines.push("");
  if (r.adjectives.people.length > 0) {
    lines.push(
      `**Démonymes à utiliser dans le copy** (M : ${r.adjectives.masculine.join(", ")} · F : ${r.adjectives.feminine.join(", ")} · collectif : ${r.adjectives.people.join(", ")}). Glisse-les dans 1-2 angles maximum (pas tous les angles, ça serait artificiel) — ex : "Pour les ${r.adjectives.people[0]} qui veulent…", "Notre solution, conçue avec ${r.adjectives.masculine[0]?.includes("é") ? "des" : "des"} ${r.adjectives.people[0]}".`
    );
  }
  if (r.cities.length > 0)
    lines.push(`**Villes à mentionner** : ${r.cities.join(", ")}`);
  if (r.landmarks.length > 0)
    lines.push(
      `**Lieux emblématiques (à intégrer dans 1-2 concepts visuels)** : ${r.landmarks.join(", ")}`
    );
  if (r.cultural.length > 0)
    lines.push(`**Références culturelles** : ${r.cultural.join(", ")}`);
  lines.push(
    `**Architecture / décor** : ${r.architecture}`
  );
  lines.push(`**Atmosphère / lumière** : ${r.atmosphere}`);
  lines.push("");
  lines.push(
    `Les CONCEPTS visuels doivent intégrer un landmark, un élément architectural ou une scène culturelle de la région — sauf si le render_style est screenshot_social ou meme (où le décor est secondaire). Les ANGLES marketing peuvent inclure une touche locale dans le copy, mais sans surcharger.`
  );
  return lines.join("\n");
}

/**
 * Format the region as an English block injected at the top of image prompts.
 * Forceful — landmarks/architecture/atmosphere become hard constraints for
 * the visual.
 */
export function formatRegionForImagePrompt(regionId: string): string {
  if (!regionId || regionId === "international") return "";
  const r = REGIONS[regionId as RegionId];
  if (!r) return "";
  const lines: string[] = [];
  lines.push(
    "══════════════════════════════════════════════════════════════════"
  );
  lines.push(
    `🌍 GEOGRAPHIC TARGETING — ${r.label.toUpperCase()} (HARD CONSTRAINT)`
  );
  lines.push(
    "══════════════════════════════════════════════════════════════════"
  );
  if (r.landmarks.length > 0) {
    lines.push("");
    lines.push(`▸ LANDMARKS (incorporate at least one when concept allows) :`);
    lines.push(`  ${r.landmarks.join(", ")}`);
  }
  if (r.architecture) {
    lines.push("");
    lines.push(`▸ ARCHITECTURE / VISUAL DECOR :`);
    lines.push(`  ${r.architecture}`);
  }
  if (r.atmosphere) {
    lines.push("");
    lines.push(`▸ ATMOSPHERE / LIGHTING / MOOD :`);
    lines.push(`  ${r.atmosphere}`);
  }
  if (r.cultural.length > 0) {
    lines.push("");
    lines.push(`▸ CULTURAL CUES (people / props if applicable) :`);
    lines.push(`  ${r.cultural.join(", ")}`);
  }
  if (r.cities.length > 0) {
    lines.push("");
    lines.push(
      `▸ CONTEXT : the visual is set in or evokes ${r.cities.slice(0, 3).join(" / ")} (and the surrounding region).`
    );
  }
  lines.push("");
  lines.push(
    `The final image must IMMEDIATELY read as being from ${r.label}. A viewer scrolling on Meta should recognize the location in 0.3 seconds. EXCEPTIONS : if the concept's render_style is "screenshot_social" or "meme", the regional setting is secondary — but if the brand voice OR copy mentions the region (e.g. "Pour les ${r.adjectives.people[0] ?? "habitants"} qui…"), the local cues still matter.`
  );
  lines.push(
    "══════════════════════════════════════════════════════════════════"
  );
  return lines.join("\n");
}
