// @flow

import gql from 'graphql-tag'
import { getManyReference } from './getManyReference'
import {
  capitalize,
  createGetListQuery,
  createGetManyQuery,
  createQueryFromType,
  createSortingKey,
  createTypeMap,
  lowercase,
  mapInputToVariables
} from './utils'
import { createFilter } from './filters'
import type {
  Factory,
  UpdateManyParams,
  ManyReferenceParams,
  Response
} from './types'
import {
  NATURAL_SORTING,
  VERB_CREATE,
  VERB_DELETE,
  VERB_DELETE_MANY,
  VERB_GET_LIST,
  VERB_GET_MANY,
  VERB_GET_MANY_REFERENCE,
  VERB_GET_ONE,
  VERB_UPDATE,
  VERB_UPDATE_MANY
} from './types'

// cache for all types
let typeMap

export const buildQuery = (introspectionResults: Object, factory: Factory) => (
  raFetchType: string,
  resourceName: string,
  params: Object
) => {
  const options = factory.options
  // By default we don't query for any complex types on the object, just scalars and scalars[]
  const allowedComplexTypes = Object.keys(options.queryValueToInputValueMap)

  const resourceTypename = capitalize(resourceName)
  const { types } = introspectionResults
  if (!typeMap) {
    typeMap = createTypeMap(types)
  }
  const type = typeMap[resourceTypename]
  const manyLowerResourceName = `${lowercase(resourceTypename)}s`
  const singleLowerResourceName = lowercase(resourceTypename)
  switch (raFetchType) {
    case VERB_GET_ONE:
      return {
        query: gql`query ${singleLowerResourceName}($id: UUID!) {
            ${singleLowerResourceName}(id: $id) {
            ${createQueryFromType(
              resourceTypename,
              typeMap,
              allowedComplexTypes
            )}
        }
        }`,
        variables: {
          id: Number(params.id)
        },
        parseResponse: (response: Response) => {
          return {
            data: response.data[singleLowerResourceName]
          }
        }
      }
    case VERB_GET_MANY:
      return {
        query: createGetManyQuery(
          type,
          manyLowerResourceName,
          resourceTypename,
          typeMap,
          allowedComplexTypes
        ),
        variables: { ids: params.ids.filter(v => Boolean(v)) },
        parseResponse: (response: Response) => {
          const { nodes } = response.data[manyLowerResourceName]
          return {
            data: nodes
          }
        }
      }
    case VERB_GET_MANY_REFERENCE:
      return getManyReference(
        params,
        type,
        manyLowerResourceName,
        resourceTypename,
        typeMap,
        allowedComplexTypes
      )
    case VERB_GET_LIST:
      const { filter, sort } = (params: ManyReferenceParams)
      const orderBy = sort
        ? [createSortingKey(sort.field, sort.order)]
        : [NATURAL_SORTING]
      const filters = createFilter(filter, type)
      return {
        query: createGetListQuery(
          type,
          manyLowerResourceName,
          resourceTypename,
          typeMap,
          allowedComplexTypes
        ),
        variables: {
          offset: (params.pagination.page - 1) * params.pagination.perPage,
          first: params.pagination.perPage,
          filter: filters,
          orderBy
        },
        parseResponse: (response: Response) => {
          const { nodes, totalCount } = response.data[manyLowerResourceName]
          return {
            data: nodes,
            total: totalCount
          }
        }
      }
    case VERB_CREATE:
      const variables = {
        input: {
          [singleLowerResourceName]: mapInputToVariables(
            params.data,
            typeMap[`${resourceTypename}Input`],
            type,
            options.queryValueToInputValueMap
          )
        }
      }
      return {
        variables,
        query: gql`mutation create${resourceTypename}($input: Create${resourceTypename}Input!) {
            create${resourceTypename} (
            input: $input
        ) {
            ${singleLowerResourceName} {
            ${createQueryFromType(
              resourceTypename,
              typeMap,
              allowedComplexTypes
            )}
        }
        }
        }`,
        parseResponse: (response: Response) => ({
          data:
            response.data[`create${resourceTypename}`][singleLowerResourceName]
        })
      }
    case VERB_DELETE:
      return {
        variables: { input: { id: params.id } },
        query: gql`
            mutation delete${resourceTypename}($input: Delete${resourceTypename}Input!) {
                delete${resourceTypename}(input: $input) {
                ${singleLowerResourceName} {
                ${createQueryFromType(
                  resourceTypename,
                  typeMap,
                  allowedComplexTypes
                )}
            }
            }
            }
        `,
        parseResponse: (response: Response) => ({
          data:
            response.data[`delete${resourceTypename}`][singleLowerResourceName]
        })
      }
    case VERB_DELETE_MANY: {
      return {
        query: gql`
            mutation deleteMany${resourceTypename} {
                ${params.ids.map(
                  id =>
                    `
                k${id}:delete${resourceTypename}(input: { id: ${id}, clientMutationId: "${id}"}) {
                  clientMutationId
                }\n
                `
                )}
            }
        `,
        parseResponse: (response: Response) => ({
          data: params.ids.map(id =>
            Number(response.data[`k${id}`].clientMutationId)
          )
        })
      }
    }
    case VERB_UPDATE:
      const updateVariables = {
        input: {
          id: Number(params.id),
          patch: mapInputToVariables(
            params.data,
            typeMap[`${resourceTypename}Patch`],
            type,
            options.queryValueToInputValueMap
          )
        }
      }
      return {
        variables: updateVariables,
        query: gql`
            mutation update${resourceTypename}($input: Update${resourceTypename}Input!) {
                update${resourceTypename}(input: $input) {
                ${singleLowerResourceName} {
                ${createQueryFromType(
                  resourceTypename,
                  typeMap,
                  allowedComplexTypes
                )}
            }
            }
            }
        `,
        parseResponse: (response: Response) => ({
          data:
            response.data[`update${resourceTypename}`][singleLowerResourceName]
        })
      }
    case VERB_UPDATE_MANY:
      const { ids, data } = (params: UpdateManyParams)
      const inputs = ids.map(id => ({
        id: Number(id),
        clientMutationId: String(id),
        patch: mapInputToVariables(
          data,
          typeMap[`${resourceTypename}Patch`],
          type,
          options.queryValueToInputValueMap
        )
      }))

      return {
        variables: inputs.reduce(
          (next, input) => ({ [`arg${input.id}`]: input, ...next }),
          {}
        ),
        query: gql`mutation updateMany${resourceTypename}(
        ${ids
          .map(id => `$arg${id}: Update${resourceTypename}Input!`)
          .join(',')}) {
            ${inputs.map(input => {
              return `
             update${input.id}:update${resourceTypename}(input: $arg${input.id}) {
               clientMutationId
             }
            `
            })}
        }`,
        parseResponse: (response: Response) => ({
          data: ids.map<number>(id =>
            Number(response.data[`update${id}`].clientMutationId)
          )
        })
      }
    default:
      throw new Error(`${raFetchType} is not yet implemented.`)
  }
}
