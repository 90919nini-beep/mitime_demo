import CrochetNoteCard from "./CrochetNoteCard";

const projects = [
  {
    title: "Autumn Harvest Shawl",
    pattern: "Hitchhiker Pattern",
    yarn: "Malabrigo Sock — Aguas",
    weight: "Fingering",
    hookSize: "3.5mm",
    skeinCount: 2,
    colorway: "#7C9A8E",
    progress: 64,
    status: "In Progress",
    priority: "High",
    dueDate: "2026-04-15",
    notes: "Remember to block after finishing. Increase tension slightly on the wing repeats.",
    tags: ["Shawl", "Lace", "Gift"],
    rowsCompleted: 128,
    totalRows: 200,
  },
  {
    title: "Cozy Baby Blanket",
    pattern: "Corner-to-Corner C2C",
    yarn: "Lion Brand Pound of Love — Pastel Yellow",
    weight: "Worsted",
    hookSize: "5.0mm",
    skeinCount: 3,
    colorway: "#F5C842",
    progress: 30,
    status: "In Progress",
    priority: "Medium",
    dueDate: "2026-03-20",
    notes: "Baby shower is on the 20th — keep consistent gauge throughout.",
    tags: ["Blanket", "Baby", "C2C"],
    rowsCompleted: 45,
    totalRows: 150,
  },
  {
    title: "Chunky Cable Sweater",
    pattern: "Drops Design 243-2",
    yarn: "Drops Andes — Off White",
    weight: "Bulky",
    hookSize: "6.0mm",
    skeinCount: 6,
    colorway: "#E8E0D5",
    progress: 100,
    status: "Completed",
    priority: "Low",
    dueDate: "2026-02-01",
    notes: "Blocked and gifted. Used 5.5mm for ribbing to keep edges neat.",
    tags: ["Sweater", "Cable", "Winter"],
    rowsCompleted: 220,
    totalRows: 220,
  },
  {
    title: "Market Tote Bag",
    pattern: "Boho Market Bag",
    yarn: "We Are Knitters — Natural Cotton",
    weight: "DK",
    hookSize: "4.0mm",
    skeinCount: 1,
    colorway: "#C4956A",
    progress: 0,
    status: "Not Started",
    priority: "Low",
    dueDate: "2026-06-01",
    notes: "Pick up cotton yarn next time at the craft store.",
    tags: ["Bag", "Summer", "Cotton"],
    rowsCompleted: 0,
    totalRows: 80,
  },
];

export default function App() {
  return (
    <div className="min-h-screen bg-[#F2F2F7] py-10 px-4">
      {/* iOS-style header */}
      <div className="max-w-sm mx-auto mb-8">
        <p className="text-[13px] font-semibold text-purple-500 uppercase tracking-widest mb-1">
          My Projects
        </p>
        <h1 className="text-[28px] font-bold text-gray-900 leading-tight">
          Stitch & Craft
        </h1>
        <p className="text-[14px] text-gray-400 mt-1">
          {projects.length} projects · {projects.filter((p) => p.status === "In Progress").length} in progress
        </p>
      </div>

      {/* Cards */}
      <div className="space-y-5 max-w-sm mx-auto">
        {projects.map((project) => (
          <CrochetNoteCard key={project.title} project={project} />
        ))}
      </div>

      <p className="text-center text-[12px] text-gray-300 mt-10">
        Stitch & Craft · Crochet Project Manager
      </p>
    </div>
  );
}
