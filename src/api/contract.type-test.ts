/**
 * 契约类型测试（编译期，无运行时断言）。
 *
 * 这个文件由 `pnpm type-check`（vue-tsc）编译：任何一条 `Expect<...>` 不成立，
 * 类型检查就会失败。它证明 `schema.d.ts` 与 `openapi-fetch` 消费端的类型
 * 与后端 OpenAPI 契约一致（D65 / V17），而不是「能生成就算数」。
 *
 * 覆盖范围：全部 20 个命名组件（列表 / 命中高亮 / 联想 / 详情 / 规格组合 / 推荐 / 分类 /
 * 购买校验 / 错误信封）与 6 个 operation 的请求、响应、错误响应类型。
 */
import type { components, operations } from './schema'
import type { ApiError, apiBaseUrl, checkPurchase, fetchProductList } from './client'
import type { describePurchaseResult } from './purchase-result'

/** 标准「类型相等」判定：双向条件类型，避免 any / never 的误判。 */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type Schemas = components['schemas']
type ErrorResponse = Schemas['ErrorResponse']
type ProductCoverImage = Schemas['ProductCoverImage']
type ProductCategory = Schemas['ProductCategory']
type CategoryListItem = Schemas['CategoryListItem']
type CategoriesResponse = Schemas['CategoriesResponse']
type ProductListResponse = Schemas['ProductListResponse']
type ProductListItem = Schemas['ProductListItem']
type ProductSearchListItem = Schemas['ProductSearchListItem']
type ProductHighlight = Schemas['ProductHighlight']
type ProductSuggestionItem = Schemas['ProductSuggestionItem']
type ProductSuggestionHighlight = Schemas['ProductSuggestionHighlight']
type ProductSuggestionsResponse = Schemas['ProductSuggestionsResponse']
type ProductRecommendationsResponse = Schemas['ProductRecommendationsResponse']
type ProductDimension = Schemas['ProductDimension']
type ProductVariant = Schemas['ProductVariant']
type ProductDetailBlock = Schemas['ProductDetailBlock']
type ProductDetailResponse = Schemas['ProductDetailResponse']
type PurchaseCheckProduct = Schemas['PurchaseCheckProduct']
type PurchaseCheckVariant = Schemas['PurchaseCheckVariant']
type PurchaseCheckResponse = Schemas['PurchaseCheckResponse']

// —— 列表分页：page / pageSize / total / totalPages / items ——
type _Page = Expect<Equal<ProductListResponse['page'], number>>
type _PageSize = Expect<Equal<ProductListResponse['pageSize'], number>>
type _Total = Expect<Equal<ProductListResponse['total'], number>>
type _TotalPages = Expect<Equal<ProductListResponse['totalPages'], number>>
type _Items = Expect<Equal<ProductListResponse['items'], ProductSearchListItem[]>>

// —— 列表项：金额是整数分（number），不是格式化字符串 ——
type _DisplayPrice = Expect<Equal<ProductListItem['displayPriceCents'], number>>
type _DisplayOriginalPrice = Expect<Equal<ProductListItem['displayOriginalPriceCents'], number>>
type _SoldOut = Expect<Equal<ProductListItem['soldOut'], boolean>>
type _Rating = Expect<Equal<ProductListItem['rating'], number>>
type _Sales = Expect<Equal<ProductListItem['sales'], number>>
type _ListItemCategory = Expect<Equal<ProductListItem['category'], ProductCategory>>
type _ListItemCover = Expect<Equal<ProductListItem['coverImage'], ProductCoverImage>>

// —— 命中高亮（#23）：列表项覆盖 name / brand / model，片段是字符串数组 ——
type _HighlightFields = Expect<Equal<keyof ProductHighlight, 'name' | 'brand' | 'model'>>
type _HighlightFragments = Expect<Equal<ProductHighlight['name'], string[] | undefined>>
type _ListHighlight = Expect<Equal<ProductSearchListItem['highlight'], ProductHighlight | undefined>>
type _SearchListItemBase = Expect<
  Equal<Pick<ProductSearchListItem, keyof ProductListItem>, ProductListItem>
>

// —— 联想（#22、#23）：条目是 slug / name / brand，命中时额外带 name / brand 高亮 ——
type _SuggestionItems = Expect<Equal<ProductSuggestionsResponse['items'], ProductSuggestionItem[]>>
type _SuggestionBase = Expect<
  Equal<Pick<ProductSuggestionItem, 'slug' | 'name' | 'brand'>, { slug: string; name: string; brand: string }>
>
type _SuggestionHighlight = Expect<
  Equal<ProductSuggestionItem['highlight'], ProductSuggestionHighlight | undefined>
>
type _SuggestionHighlightFields = Expect<Equal<keyof ProductSuggestionHighlight, 'name' | 'brand'>>
type _SuggestionFragments = Expect<Equal<ProductSuggestionHighlight['brand'], string[] | undefined>>
type _SuggestionError = Expect<
  Equal<operations['listSuggestions']['responses'][503]['content']['application/json'], ErrorResponse>
>

// —— 图片 / 分类 / 推荐 / 分类列表 ——
type _CoverImage = Expect<Equal<ProductCoverImage, { path: string; alt: string }>>
type _Category = Expect<Equal<ProductCategory, { slug: string; name: string }>>
type _CategoryListItem = Expect<Equal<CategoryListItem, { slug: string; name: string }>>
type _CategoriesItems = Expect<Equal<CategoriesResponse['items'], CategoryListItem[]>>
type _RecommendationItems = Expect<Equal<ProductRecommendationsResponse['items'], ProductListItem[]>>

// —— 详情响应：库存、图集、规格组合、详情块 ——
type _DetailStock = Expect<Equal<ProductDetailResponse['stock'], number>>
type _DetailImages = Expect<Equal<ProductDetailResponse['images'], ProductCoverImage[]>>
type _DetailDimensions = Expect<Equal<ProductDetailResponse['dimensions'], ProductDimension[]>>
type _DetailVariants = Expect<Equal<ProductDetailResponse['variants'], ProductVariant[]>>
type _DetailBlocks = Expect<Equal<ProductDetailResponse['detail'], ProductDetailBlock[]>>
type _DimensionOptions = Expect<Equal<ProductDimension['options'], string[]>>
type _VariantSku = Expect<Equal<ProductVariant['sku'], string>>
type _VariantPrice = Expect<Equal<ProductVariant['priceCents'], number>>
type _VariantOriginalPrice = Expect<Equal<ProductVariant['originalPriceCents'], number>>
type _VariantStock = Expect<Equal<ProductVariant['stock'], number>>

// —— 详情块是 text / image 二分支联合 ——
type TextBlock = Extract<ProductDetailBlock, { type: 'text' }>
type ImageBlock = Extract<ProductDetailBlock, { type: 'image' }>
type _TextBlock = Expect<Equal<TextBlock, { type: 'text'; text: string }>>
type _ImageBlock = Expect<Equal<ImageBlock, { type: 'image'; path: string; alt: string }>>

// —— 购买校验入参里的商品 / 规格摘要 ——
type _CheckProduct = Expect<Equal<PurchaseCheckProduct, { slug: string; name: string }>>
type _CheckVariant = Expect<
  Equal<PurchaseCheckVariant, { sku: string; option1Value: string; option2Value: string }>
>

// —— 购买校验三分支：result 两个取值，blocked 下按 reason 再分两支 ——
type _ResultTags = Expect<Equal<PurchaseCheckResponse['result'], 'purchasable' | 'blocked'>>
type BlockedBranch = Extract<PurchaseCheckResponse, { result: 'blocked' }>
type _ReasonTags = Expect<Equal<BlockedBranch['reason'], 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED'>>
type PriceChangedBranch = Extract<PurchaseCheckResponse, { reason: 'PRICE_CHANGED' }>
type _RequestedPrice = Expect<Equal<PriceChangedBranch['requestedUnitPriceCents'], number>>
type PurchasableBranch = Extract<PurchaseCheckResponse, { result: 'purchasable' }>
type _PurchasablePriceChanged = Expect<Equal<PurchasableBranch['priceChanged'], false>>

// —— 错误信封：七码枚举 + message + 可选 details ——
type ErrorEnvelope = ErrorResponse['error']
type _ErrorCode = Expect<
  Equal<
    ErrorEnvelope['code'],
    | 'VALIDATION_FAILED'
    | 'PRODUCT_NOT_FOUND'
    | 'VARIANT_NOT_FOUND'
    | 'VARIANT_NOT_IN_PRODUCT'
    | 'SEARCH_NOT_AVAILABLE'
    | 'NOT_FOUND'
    | 'INTERNAL_ERROR'
  >
>
type _ErrorMessage = Expect<Equal<ErrorEnvelope['message'], string>>
type _ErrorDetails = Expect<
  Equal<ErrorEnvelope['details'], { path: string; message: string }[] | undefined>
>

// —— 5 个 operation 的请求参数 ——
type ListQuery = NonNullable<operations['listProducts']['parameters']['query']>
type _ListArg = Expect<Equal<Parameters<typeof fetchProductList>[0], ListQuery>>
type _ListSort = Expect<Equal<ListQuery['sort'], 'price_asc' | 'price_desc' | 'sales_desc' | undefined>>
type _ListPage = Expect<Equal<ListQuery['page'], number | undefined>>
type _ListKeyword = Expect<Equal<ListQuery['keyword'], string | undefined>>
type _DetailPath = Expect<Equal<operations['getProduct']['parameters']['path'], { slug: string }>>
type _RecommendationPath = Expect<
  Equal<operations['listRecommendations']['parameters']['path'], { slug: string }>
>
type PurchaseBody = operations['checkPurchase']['requestBody']['content']['application/json']
type _PurchaseArg = Expect<Equal<Parameters<typeof checkPurchase>[0], PurchaseBody>>
type _PurchaseBody = Expect<
  Equal<
    PurchaseBody,
    { slug: string; sku: string; quantity: number; expectedUnitPriceCents?: number }
  >
>

// —— 5 个 operation 的错误响应都指向同一个错误信封 ——
type _ListError = Expect<
  Equal<operations['listProducts']['responses'][400]['content']['application/json'], ErrorResponse>
>
type _DetailError = Expect<
  Equal<operations['getProduct']['responses'][404]['content']['application/json'], ErrorResponse>
>
type _RecommendationError = Expect<
  Equal<
    operations['listRecommendations']['responses'][404]['content']['application/json'],
    ErrorResponse
  >
>
type _CategoriesError = Expect<
  Equal<operations['listCategories']['responses'][500]['content']['application/json'], ErrorResponse>
>
type _PurchaseError = Expect<
  Equal<operations['checkPurchase']['responses'][409]['content']['application/json'], ErrorResponse>
>

// —— 客户端按路径调用，返回类型来自 schema.d.ts ——
type _ListReturn = Expect<Equal<Awaited<ReturnType<typeof fetchProductList>>, ProductListResponse>>
type _PurchaseReturn = Expect<Equal<Awaited<ReturnType<typeof checkPurchase>>, PurchaseCheckResponse>>

// —— ApiError 携带错误信封，基址是 string ——
type _ApiErrorStatus = Expect<Equal<ApiError['status'], number>>
type _ApiErrorBody = Expect<Equal<ApiError['error'], ErrorResponse | undefined>>
type _BaseUrl = Expect<Equal<typeof apiBaseUrl, string>>

// —— 穷尽检查的返回类型 ——
type _Summary = Expect<Equal<ReturnType<typeof describePurchaseResult>, string>>

/**
 * 汇总所有断言。本项目未开 `noUnusedLocals`，显式导出是为了让这些别名
 * 在编辑器与检索里可见，而不是被当成死代码。
 */
export type ContractTypeTests =
  | _Page
  | _PageSize
  | _Total
  | _TotalPages
  | _Items
  | _HighlightFields
  | _HighlightFragments
  | _ListHighlight
  | _SearchListItemBase
  | _DisplayPrice
  | _DisplayOriginalPrice
  | _SoldOut
  | _Rating
  | _Sales
  | _ListItemCategory
  | _ListItemCover
  | _CoverImage
  | _Category
  | _CategoryListItem
  | _CategoriesItems
  | _RecommendationItems
  | _SuggestionItems
  | _SuggestionBase
  | _SuggestionHighlight
  | _SuggestionHighlightFields
  | _SuggestionFragments
  | _SuggestionError
  | _DetailStock
  | _DetailImages
  | _DetailDimensions
  | _DetailVariants
  | _DetailBlocks
  | _DimensionOptions
  | _VariantSku
  | _VariantPrice
  | _VariantOriginalPrice
  | _VariantStock
  | _TextBlock
  | _ImageBlock
  | _CheckProduct
  | _CheckVariant
  | _ResultTags
  | _ReasonTags
  | _RequestedPrice
  | _PurchasablePriceChanged
  | _ErrorCode
  | _ErrorMessage
  | _ErrorDetails
  | _ListArg
  | _ListSort
  | _ListPage
  | _ListKeyword
  | _DetailPath
  | _RecommendationPath
  | _PurchaseArg
  | _PurchaseBody
  | _ListError
  | _DetailError
  | _RecommendationError
  | _CategoriesError
  | _PurchaseError
  | _ListReturn
  | _PurchaseReturn
  | _ApiErrorStatus
  | _ApiErrorBody
  | _BaseUrl
  | _Summary
