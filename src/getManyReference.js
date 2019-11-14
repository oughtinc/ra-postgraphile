// @flow

import { createSortingKey, createGetListQuery } from './utils'
import { NATURAL_SORTING } from './types'
import type { ManyReferenceParams, Response } from './types'
import { createFilter } from './filters'

export const getManyReference = (
  params: ManyReferenceParams,
  type: Object,
  manyLowerResallResourceNameourceName: string,
  resourceTypename: string,
  typeMap: Object,
  allowedTypes: Array<string>
) => {
  const { filter, sort, target, id, pagination } = params
  const orderBy = sort
    ? [createSortingKey(sort.field, sort.order)]
    : [NATURAL_SORTING]
  const filters = createFilter({ [target]: id, ...filter }, type)
  return {
    query: createGetListQuery(
      type,
      allResourceName,
      resourceTypename,
      typeMap,
      allowedTypes
    ),
    variables: {
      offset: (pagination.page - 1) * pagination.perPage,
      first: pagination.perPage,
      filter: filters,
      orderBy
    },
    parseResponse: (response: Response) => {
      const { nodes, totalCount } = response.data[allResourceName]
      return {
        data: nodes,
        total: totalCount
      }
    }
  }
}
