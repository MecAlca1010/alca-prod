import { useParams, Link } from 'react-router-dom'

interface ProjectDetailProps {
  isAdmin: boolean
}

export default function ProjectDetail({ isAdmin }: ProjectDetailProps) {
  const { id } = useParams()

  return (
    <div>
      <Link to="/" className="text-sm text-gray-500 hover:text-black mb-4 inline-block">
        ← Retour au tableau de bord
      </Link>
      
      <h1 className="text-3xl font-black mb-2">Fiche projet</h1>
      <p className="text-gray-500 mb-8">ID: {id}</p>

      <div className="bg-white rounded-xl border p-6 text-gray-400">
        Contenu de la fiche projet à venir (informations, étapes, composants, lien SharePoint...)
        {isAdmin && <p className="mt-2 text-sm">Mode admin actif</p>}
      </div>
    </div>
  )
}
