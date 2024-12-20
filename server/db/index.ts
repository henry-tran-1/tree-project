import {
  RelationshipEntry,
  RelationshipPath,
} from '../../models/relationships.ts'
import { Person, PersonData } from '../../models/person.ts'
import connection from './connection.ts'

// Returns the entire persons table
export async function getAllPersons(db = connection): Promise<Person[]> {
  return db('persons').select()
}

// Add new person to persons table (currently only attached unknown polaroid)
// Returns the id of the added person
export async function addPerson(person: PersonData, db = connection) {
  const [id] = await db('persons').insert({
    ...person,
    image: 'unknown_polaroid.png',
  })
  return id
}

// Add new relationships for an added person to relationships table
export async function addRelationship(
  relationship: RelationshipEntry,
  db = connection,
) {
  await db('relationships').insert(relationship)
}

// Recursive CTE query that finds relationship of endPerson to startPerson
// returns the relationship_path, target_person_gender, and depth
export async function findRelationshipPath(
  startPersonId: number,
  endPersonId: number,
): Promise<RelationshipPath | undefined> {
  const result = await connection.raw(
    `
    WITH RECURSIVE relationship_path AS (
      -- Base case
      SELECT 
        person_id_1 AS source_id,
        person_id_2 AS target_id,
        relationship_type,
        1 AS depth,
        relationship_type AS relationship_path,
        json_array(person_id_1, person_id_2) AS visited_ids
      FROM relationships
      WHERE person_id_1 = ?

      UNION ALL
      
      -- Recursive case
      SELECT 
        r.person_id_1 AS source_id,
        r.person_id_2 AS target_id,
        r.relationship_type,
        rp.depth + 1,
        rp.relationship_path || ',' || r.relationship_type AS relationship_path,
        json_insert(rp.visited_ids, '$[' || json_array_length(rp.visited_ids) || ']', r.person_id_2) AS visited_ids
      FROM relationships r
      JOIN relationship_path rp ON r.person_id_1 = rp.target_id
      WHERE rp.depth < 10
      AND r.person_id_2 NOT IN (
        SELECT value 
        FROM json_each(rp.visited_ids)
      )
    )
    SELECT 
      relationship_path,
      depth,
      p.gender AS target_person_gender
    FROM relationship_path rp
    JOIN persons p ON p.id = rp.target_id
    WHERE rp.target_id = ?
    ORDER BY depth
    LIMIT 1;
  `,
    [startPersonId, endPersonId],
  )

  return result[0]
}
